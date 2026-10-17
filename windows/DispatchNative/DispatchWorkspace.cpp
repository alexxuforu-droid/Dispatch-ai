#include "pch.h"
#include "DispatchWorkspace.h"

#include <shobjidl_core.h>
#include <shlobj.h>
#include <filesystem>
#include <fstream>
#include <algorithm>
#include <thread>
#include <vector>
#include <iterator>
#include <cstring>
#include <cctype>
#include <memory>
#include <stdexcept>
#include <cwctype>
#include <wincrypt.h>

namespace {
namespace fs = std::filesystem;
constexpr std::size_t kMaxEntries = 300;
constexpr std::size_t kMaxReadBytes = 1024 * 1024;

fs::path toPath(std::string const &value) {
  return fs::path(winrt::to_hstring(value).c_str());
}

fs::path safePath(std::string const &rootValue, std::string const &relativeValue) {
  if (rootValue.empty()) throw std::runtime_error("Choose a project folder first.");
  const auto root = fs::canonical(toPath(rootValue));
  const auto relative = toPath(relativeValue);
  if (relative.is_absolute() || relative.has_root_name()) throw std::runtime_error("The requested path must be relative to the selected project.");
  for (const auto &part : relative) if (part == L"..") throw std::runtime_error("Parent-directory paths are not allowed.");
  const auto target = fs::canonical(root / relative);
  const auto belowRoot = target.lexically_relative(root);
  if (belowRoot.empty() && target != root) throw std::runtime_error("The requested path is outside the selected project.");
  for (const auto &part : belowRoot) if (part == L"..") throw std::runtime_error("The requested path is outside the selected project.");
  return target;
}

std::string jsonEscape(std::string const &input) {
  std::string output; output.reserve(input.size() + 8);
  for (unsigned char ch : input) {
    if (ch == '"' || ch == '\\') { output.push_back('\\'); output.push_back(static_cast<char>(ch)); }
    else if (ch < 0x20) { const char hex[] = "0123456789abcdef"; output.append("\\u00"); output.push_back(hex[ch >> 4]); output.push_back(hex[ch & 0x0f]); }
    else output.push_back(static_cast<char>(ch));
  }
  return output;
}

std::string listDirectory(std::string const &rootValue, std::string const &relativeValue) {
  const auto root = fs::canonical(toPath(rootValue));
  const auto directory = safePath(rootValue, relativeValue);
  if (!fs::is_directory(directory)) throw std::runtime_error("The selected path is not a folder.");
  struct Entry { std::string name; std::string path; bool directory; std::uintmax_t size; };
  std::vector<Entry> entries;
  for (const auto &item : fs::directory_iterator(directory)) {
    if (item.is_symlink()) continue;
    const bool isDirectory = item.is_directory();
    if (!isDirectory && !item.is_regular_file()) continue;
    const auto relative = item.path().lexically_relative(root).generic_wstring();
    const auto name = item.path().filename().wstring();
    entries.push_back({winrt::to_string(winrt::hstring{name}), winrt::to_string(winrt::hstring{relative}), isDirectory, isDirectory ? 0 : item.file_size()});
    if (entries.size() >= kMaxEntries) break;
  }
  std::sort(entries.begin(), entries.end(), [](Entry const &left, Entry const &right) {
    if (left.directory != right.directory) return left.directory;
    return _stricmp(left.name.c_str(), right.name.c_str()) < 0;
  });
  std::string json = "[";
  for (std::size_t i = 0; i < entries.size(); ++i) {
    if (i) json.push_back(',');
    const auto &entry = entries[i];
    json += "{\"name\":\"" + jsonEscape(entry.name) + "\",\"relativePath\":\"" + jsonEscape(entry.path) + "\",\"type\":\"" + (entry.directory ? "directory" : "file") + "\",\"size\":" + std::to_string(entry.size) + "}";
  }
  json.push_back(']');
  return json;
}

std::string readText(std::string const &rootValue, std::string const &relativeValue, double maxBytes) {
  const auto path = safePath(rootValue, relativeValue);
  if (!fs::is_regular_file(path)) throw std::runtime_error("The selected path is not a file.");
  const auto length = fs::file_size(path);
  const auto requestedLimit = maxBytes > 0 ? (std::min)(static_cast<double>(kMaxReadBytes), maxBytes) : static_cast<double>(kMaxReadBytes);
  const auto limit = static_cast<std::size_t>(requestedLimit);
  if (length > limit) throw std::runtime_error("This file is too large to preview (1 MB maximum).");
  std::ifstream stream(path, std::ios::binary);
  if (!stream) throw std::runtime_error("The file could not be opened.");
  std::string contents((std::istreambuf_iterator<char>(stream)), std::istreambuf_iterator<char>());
  if (contents.find('\0') != std::string::npos) throw std::runtime_error("Binary files cannot be previewed as text.");
  if (!contents.empty() && MultiByteToWideChar(CP_UTF8, MB_ERR_INVALID_CHARS, contents.data(), static_cast<int>(contents.size()), nullptr, 0) == 0)
    throw std::runtime_error("Only UTF-8 text files can be previewed.");
  return contents;
}

std::string grepText(std::string const &rootValue, std::string const &relativeValue, std::string const &query, double maxResults) {
  if (query.empty() || query.size() > 160) throw std::runtime_error("Search text must contain 1 to 160 characters.");
  const auto root = fs::canonical(toPath(rootValue));
  const auto start = safePath(rootValue, relativeValue);
  if (!fs::is_directory(start) && !fs::is_regular_file(start)) throw std::runtime_error("The search location is not a file or folder.");
  const auto limit = static_cast<std::size_t>((std::min)(60.0, (std::max)(1.0, maxResults)));
  auto lower = [](std::string value) {
    std::transform(value.begin(), value.end(), value.begin(), [](unsigned char ch) { return static_cast<char>(std::tolower(ch)); });
    return value;
  };
  const auto needle = lower(query);
  std::string json = "[";
  std::size_t matches = 0, scanned = 0, totalBytes = 0;
  auto inspectFile = [&](fs::path const &file) {
    if (matches >= limit || scanned >= 500 || !fs::is_regular_file(file) || fs::is_symlink(file)) return;
    std::error_code sizeError;
    const auto size = fs::file_size(file, sizeError);
    if (sizeError || size > 512 * 1024 || totalBytes + size > 16 * 1024 * 1024) return;
    ++scanned; totalBytes += static_cast<std::size_t>(size);
    std::ifstream stream(file, std::ios::binary);
    if (!stream) return;
    std::string line; std::size_t lineNumber = 0;
    const auto relative = file.lexically_relative(root).generic_wstring();
    const auto displayPath = winrt::to_string(winrt::hstring{relative});
    while (matches < limit && std::getline(stream, line)) {
      ++lineNumber;
      if (line.find('\0') != std::string::npos) break;
      if (!line.empty() && MultiByteToWideChar(CP_UTF8, MB_ERR_INVALID_CHARS, line.data(), static_cast<int>(line.size()), nullptr, 0) == 0) continue;
      if (lower(line).find(needle) == std::string::npos) continue;
      if (matches++) json.push_back(',');
      if (line.size() > 400) line = line.substr(0, 400) + "…";
      json += "{\"path\":\"" + jsonEscape(displayPath) + "\",\"line\":" + std::to_string(lineNumber) + ",\"text\":\"" + jsonEscape(line) + "\"}";
    }
  };
  if (fs::is_regular_file(start)) inspectFile(start);
  else {
    for (fs::recursive_directory_iterator it(start, fs::directory_options::skip_permission_denied), end; it != end && matches < limit && scanned < 500; ++it) {
      std::error_code statusError;
      const auto status = it->symlink_status(statusError);
      if (statusError) continue;
      if (fs::is_symlink(status)) { if (it->is_directory(statusError)) it.disable_recursion_pending(); continue; }
      if (it->is_directory(statusError)) {
        const auto name = it->path().filename().wstring();
        if (_wcsicmp(name.c_str(), L".git") == 0 || _wcsicmp(name.c_str(), L"node_modules") == 0 || _wcsicmp(name.c_str(), L"build") == 0 || _wcsicmp(name.c_str(), L"dist") == 0 || _wcsicmp(name.c_str(), L".vs") == 0) it.disable_recursion_pending();
      } else inspectFile(it->path());
    }
  }
  json.push_back(']');
  return json;
}

bool withinRoot(fs::path const &root, fs::path const &target) {
  const auto relative = target.lexically_relative(root);
  if (relative.empty()) return target == root;
  for (const auto &part : relative) if (part == L"..") return false;
  return !relative.is_absolute();
}

bool validUtf8Text(std::string const &value) {
  return value.find('\0') == std::string::npos && (value.empty() || MultiByteToWideChar(CP_UTF8, MB_ERR_INVALID_CHARS, value.data(), static_cast<int>(value.size()), nullptr, 0) != 0);
}

bool safeWindowsSegment(std::wstring const &segment) {
  if (segment.empty() || segment == L"." || segment == L".." || segment.back() == L'.' || segment.back() == L' ') return false;
  if (segment.find_first_of(L"<>:\"|?*") != std::wstring::npos) return false;
  for (wchar_t ch : segment) if (iswcntrl(ch)) return false;
  const auto dot = segment.find(L'.');
  const auto stem = segment.substr(0, dot);
  if (_wcsicmp(stem.c_str(), L"CON") == 0 || _wcsicmp(stem.c_str(), L"PRN") == 0 || _wcsicmp(stem.c_str(), L"AUX") == 0 || _wcsicmp(stem.c_str(), L"NUL") == 0) return false;
  if (stem.size() == 4 && (_wcsnicmp(stem.c_str(), L"COM", 3) == 0 || _wcsnicmp(stem.c_str(), L"LPT", 3) == 0) && stem[3] >= L'1' && stem[3] <= L'9') return false;
  return true;
}

std::string applyTextFile(std::string const &rootValue, std::string const &relativeValue, std::string const &expected, std::string const &replacement, bool createOnly) {
  constexpr std::size_t kMaxWriteBytes = 1024 * 1024;
  if (expected.size() > kMaxWriteBytes || replacement.size() > kMaxWriteBytes) throw std::runtime_error("A proposed file is larger than the 1 MB write limit.");
  if (!validUtf8Text(expected) || !validUtf8Text(replacement)) throw std::runtime_error("Only UTF-8 text files can be applied.");
  if (relativeValue.empty()) throw std::runtime_error("A project-relative file path is required.");
  if (relativeValue.size() > 220) throw std::runtime_error("The proposed project-relative path is too long.");
  const auto root = fs::canonical(toPath(rootValue));
  if (!fs::is_directory(root)) throw std::runtime_error("The selected project folder is no longer available.");
  const auto relative = toPath(relativeValue);
  if (relative.is_absolute() || relative.has_root_name() || relativeValue.find(':') != std::string::npos) throw std::runtime_error("The requested file must be inside the selected project.");
  for (const auto &part : relative) if (!safeWindowsSegment(part.wstring())) throw std::runtime_error("The proposed path contains an unsupported Windows file name.");
  const auto parent = fs::canonical(root / relative.parent_path());
  if (!withinRoot(root, parent) || !fs::is_directory(parent)) throw std::runtime_error("The requested file must be inside an existing project folder.");
  const auto target = parent / relative.filename();
  std::error_code statusError;
  const auto status = fs::symlink_status(target, statusError);
  if (statusError && statusError != std::errc::no_such_file_or_directory) throw std::runtime_error("The target file could not be inspected.");
  if (fs::is_symlink(status)) throw std::runtime_error("Symbolic links cannot be replaced by a proposal.");
  const bool exists = fs::exists(status);
  if (createOnly && exists) throw std::runtime_error("A file already exists at this new-file path. Refresh its contents before proposing an edit.");
  if (!createOnly && !exists) throw std::runtime_error("The project file no longer exists. Refresh its context before applying the proposal.");
  if (exists && (fs::is_symlink(status) || !fs::is_regular_file(status))) throw std::runtime_error("Only regular project files can be replaced.");
  if (exists) {
    const auto current = readText(rootValue, relativeValue, static_cast<double>(kMaxWriteBytes));
    if (current != expected) throw std::runtime_error("The project file changed since the proposal was reviewed. Refresh its context and ask the agents to revise it.");
  } else if (!expected.empty()) {
    throw std::runtime_error("The original project file no longer exists. Refresh its context before applying the proposal.");
  }

  const auto nonce = std::to_wstring(GetCurrentProcessId()) + L"-" + std::to_wstring(GetTickCount64());
  auto temporary = target; temporary += L".dispatch-" + nonce + L".tmp";
  HANDLE file = CreateFileW(temporary.c_str(), GENERIC_WRITE, 0, nullptr, CREATE_NEW, FILE_ATTRIBUTE_TEMPORARY, nullptr);
  if (file == INVALID_HANDLE_VALUE) throw std::runtime_error("A temporary project file could not be created.");
  bool writeOk = true;
  std::size_t offset = 0;
  while (offset < replacement.size()) {
    const auto amount = static_cast<DWORD>((std::min)(replacement.size() - offset, static_cast<std::size_t>(MAXDWORD)));
    DWORD written = 0;
    if (!WriteFile(file, replacement.data() + offset, amount, &written, nullptr) || written != amount) { writeOk = false; break; }
    offset += written;
  }
  if (!FlushFileBuffers(file)) writeOk = false;
  CloseHandle(file);
  if (!writeOk) { DeleteFileW(temporary.c_str()); throw std::runtime_error("The proposed file could not be written completely."); }

  // Recheck the compare-and-swap condition immediately before the atomic replacement.
  statusError.clear();
  const auto currentStatus = fs::symlink_status(target, statusError);
  if (fs::is_symlink(currentStatus)) { DeleteFileW(temporary.c_str()); throw std::runtime_error("The target became a symbolic link while applying the proposal. No replacement was made."); }
  const bool stillExists = !statusError && fs::exists(currentStatus);
  if (stillExists != exists || (stillExists && (fs::is_symlink(currentStatus) || readText(rootValue, relativeValue, static_cast<double>(kMaxWriteBytes)) != expected))) {
    DeleteFileW(temporary.c_str());
    throw std::runtime_error("The project file changed while the proposal was being applied. No replacement was made.");
  }
  const DWORD moveFlags = MOVEFILE_WRITE_THROUGH | (exists ? MOVEFILE_REPLACE_EXISTING : 0);
  if (!MoveFileExW(temporary.c_str(), target.c_str(), moveFlags)) {
    DeleteFileW(temporary.c_str());
    throw std::runtime_error("The reviewed file could not be moved into the project. Check that the file is not locked.");
  }
  return relativeValue;
}

std::string removeTextFile(std::string const &rootValue, std::string const &relativeValue, std::string const &expected) {
  constexpr std::size_t kMaxWriteBytes = 1024 * 1024;
  if (expected.empty() || expected.size() > kMaxWriteBytes || !validUtf8Text(expected)) throw std::runtime_error("Only a non-empty UTF-8 file up to 1 MB can be reverted.");
  if (relativeValue.empty() || relativeValue.size() > 220) throw std::runtime_error("A project-relative file path is required.");
  const auto root = fs::canonical(toPath(rootValue));
  if (!fs::is_directory(root)) throw std::runtime_error("The selected project folder is no longer available.");
  const auto relative = toPath(relativeValue);
  if (relative.is_absolute() || relative.has_root_name() || relativeValue.find(':') != std::string::npos) throw std::runtime_error("The requested file must be inside the selected project.");
  for (const auto &part : relative) if (!safeWindowsSegment(part.wstring())) throw std::runtime_error("The proposed path contains an unsupported Windows file name.");
  const auto parent = fs::canonical(root / relative.parent_path());
  if (!withinRoot(root, parent) || !fs::is_directory(parent)) throw std::runtime_error("The requested file must be inside the selected project.");
  const auto target = parent / relative.filename();
  std::error_code statusError;
  const auto status = fs::symlink_status(target, statusError);
  if (statusError || fs::is_symlink(status) || !fs::is_regular_file(status)) throw std::runtime_error("The applied file is no longer a regular project file.");
  if (readText(rootValue, relativeValue, static_cast<double>(kMaxWriteBytes)) != expected) throw std::runtime_error("The project file changed after Dispatch applied it. No undo was made.");
  if (!DeleteFileW(target.c_str())) throw std::runtime_error("The applied project file could not be removed. Check whether it is locked.");
  return relativeValue;
}

std::string decodeFileUri(std::string const &uri) {
  constexpr char prefix[] = "file:///";
  if (uri.rfind(prefix, 0) != 0 || uri.size() > 2048) throw std::runtime_error("The design reference is not a local file.");
  std::string path; path.reserve(uri.size());
  for (std::size_t i = sizeof(prefix) - 1; i < uri.size(); ++i) {
    if (uri[i] == '%') {
      if (i + 2 >= uri.size()) throw std::runtime_error("The design reference path is malformed.");
      auto hex = [](char ch) -> int { if (ch >= '0' && ch <= '9') return ch - '0'; if (ch >= 'A' && ch <= 'F') return ch - 'A' + 10; if (ch >= 'a' && ch <= 'f') return ch - 'a' + 10; return -1; };
      const int high = hex(uri[i + 1]), low = hex(uri[i + 2]);
      if (high < 0 || low < 0) throw std::runtime_error("The design reference path is malformed.");
      path.push_back(static_cast<char>((high << 4) | low)); i += 2;
    } else path.push_back(uri[i]);
  }
  return path;
}

std::string pathFileUri(fs::path const &path) {
  const auto wide = path.generic_wstring();
  const auto length = WideCharToMultiByte(CP_UTF8, WC_ERR_INVALID_CHARS, wide.data(), static_cast<int>(wide.size()), nullptr, 0, nullptr, nullptr);
  if (length <= 0) throw std::runtime_error("The design reference path could not be encoded.");
  std::string utf8(static_cast<std::size_t>(length), '\0');
  WideCharToMultiByte(CP_UTF8, WC_ERR_INVALID_CHARS, wide.data(), static_cast<int>(wide.size()), utf8.data(), length, nullptr, nullptr);
  std::string uri = "file:///"; static constexpr char hex[] = "0123456789ABCDEF";
  for (unsigned char ch : utf8) {
    const bool safe = (ch >= 'a' && ch <= 'z') || (ch >= 'A' && ch <= 'Z') || (ch >= '0' && ch <= '9') || ch == '/' || ch == ':' || ch == '-' || ch == '_' || ch == '.' || ch == '~';
    if (safe) uri.push_back(static_cast<char>(ch)); else { uri.push_back('%'); uri.push_back(hex[ch >> 4]); uri.push_back(hex[ch & 0x0f]); }
  }
  return uri;
}

std::string readDesignImage(std::string const &uri, std::wstring const &directory) {
  constexpr std::size_t kMaxReferenceBytes = 8 * 1024 * 1024;
  const auto root = fs::canonical(fs::path(directory));
  const auto target = fs::canonical(toPath(decodeFileUri(uri)));
  std::error_code statusError;
  const auto status = fs::symlink_status(target, statusError);
  if (statusError || fs::is_symlink(status) || !fs::is_regular_file(status) || !withinRoot(root, target)) throw std::runtime_error("Design references must be regular images imported into Dispatch's private reference folder.");
  const auto ext = target.extension().wstring();
  std::string mime;
  if (_wcsicmp(ext.c_str(), L".png") == 0) mime = "image/png";
  else if (_wcsicmp(ext.c_str(), L".jpg") == 0 || _wcsicmp(ext.c_str(), L".jpeg") == 0) mime = "image/jpeg";
  else if (_wcsicmp(ext.c_str(), L".webp") == 0) mime = "image/webp";
  else throw std::runtime_error("Use a PNG, JPEG, or WebP design reference.");
  const auto size = fs::file_size(target);
  if (size == 0 || size > kMaxReferenceBytes) throw std::runtime_error("The design reference must be between 1 byte and 8 MB.");
  std::ifstream stream(target, std::ios::binary);
  if (!stream) throw std::runtime_error("The design reference could not be read.");
  std::vector<unsigned char> bytes(static_cast<std::size_t>(size));
  stream.read(reinterpret_cast<char *>(bytes.data()), static_cast<std::streamsize>(bytes.size()));
  if (!stream || bytes.empty()) throw std::runtime_error("The design reference could not be read completely.");
  DWORD encodedLength = 0;
  if (!CryptBinaryToStringA(bytes.data(), static_cast<DWORD>(bytes.size()), CRYPT_STRING_BASE64 | CRYPT_STRING_NOCRLF, nullptr, &encodedLength)) throw std::runtime_error("The design reference could not be encoded.");
  std::string base64(encodedLength, '\0');
  if (!CryptBinaryToStringA(bytes.data(), static_cast<DWORD>(bytes.size()), CRYPT_STRING_BASE64 | CRYPT_STRING_NOCRLF, base64.data(), &encodedLength)) throw std::runtime_error("The design reference could not be encoded.");
  if (!base64.empty() && base64.back() == '\0') base64.pop_back();
  return "{\"mimeType\":\"" + mime + "\",\"base64\":\"" + base64 + "\"}";
}

std::string errorText(std::exception const &error) { return error.what(); }

std::string savePng(std::string const &base64, std::string const &fileName, std::wstring const &directory) {
  constexpr std::size_t kMaxBase64Bytes = 48 * 1024 * 1024;
  if (directory.empty()) throw std::runtime_error("The app's private artifact folder is unavailable.");
  if (base64.empty() || base64.size() > kMaxBase64Bytes || base64.size() > MAXDWORD) throw std::runtime_error("The generated image is empty or exceeds the 36 MB limit.");
  DWORD byteCount = 0;
  if (!CryptStringToBinaryA(base64.data(), static_cast<DWORD>(base64.size()), CRYPT_STRING_BASE64, nullptr, &byteCount, nullptr, nullptr) || byteCount > 36 * 1024 * 1024)
    throw std::runtime_error("The generated image data could not be decoded or exceeds the 36 MB limit.");
  std::vector<BYTE> bytes(byteCount);
  if (!CryptStringToBinaryA(base64.data(), static_cast<DWORD>(base64.size()), CRYPT_STRING_BASE64, bytes.data(), &byteCount, nullptr, nullptr))
    throw std::runtime_error("The generated image data could not be decoded.");
  static const BYTE pngSignature[] = {0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a};
  if (byteCount < sizeof(pngSignature) || std::memcmp(bytes.data(), pngSignature, sizeof(pngSignature)) != 0)
    throw std::runtime_error("The image endpoint did not return a PNG file.");

  std::wstring safeName;
  for (unsigned char ch : fileName) {
    if (safeName.size() >= 72) break;
    safeName.push_back((ch >= 'a' && ch <= 'z') || (ch >= 'A' && ch <= 'Z') || (ch >= '0' && ch <= '9') || ch == '-' || ch == '_' ? static_cast<wchar_t>(ch) : L'_');
  }
  if (safeName.empty()) safeName = L"dispatch-image";
  const auto target = fs::path(directory) / (safeName + L".png");
  auto temporary = target; temporary += L".part";
  {
    std::ofstream stream(temporary, std::ios::binary | std::ios::trunc);
    if (!stream) throw std::runtime_error("The app could not create the image artifact.");
    stream.write(reinterpret_cast<char const *>(bytes.data()), byteCount);
    stream.flush();
    if (!stream) { stream.close(); std::error_code ignored; fs::remove(temporary, ignored); throw std::runtime_error("The image artifact could not be written completely."); }
  }
  std::error_code moveError;
  fs::rename(temporary, target, moveError);
  if (moveError) { std::error_code ignored; fs::remove(temporary, ignored); throw std::runtime_error("The image artifact could not be finalized."); }
  auto uriPath = target.wstring();
  std::replace(uriPath.begin(), uriPath.end(), L'\\', L'/');
  const int utf8Length = WideCharToMultiByte(CP_UTF8, WC_ERR_INVALID_CHARS, uriPath.data(), static_cast<int>(uriPath.size()), nullptr, 0, nullptr, nullptr);
  if (utf8Length <= 0) throw std::runtime_error("The artifact path could not be encoded.");
  std::string utf8(static_cast<std::size_t>(utf8Length), '\0');
  WideCharToMultiByte(CP_UTF8, WC_ERR_INVALID_CHARS, uriPath.data(), static_cast<int>(uriPath.size()), utf8.data(), utf8Length, nullptr, nullptr);
  std::string uri = "file:///";
  static constexpr char hex[] = "0123456789ABCDEF";
  for (unsigned char ch : utf8) {
    const bool safe = (ch >= 'a' && ch <= 'z') || (ch >= 'A' && ch <= 'Z') || (ch >= '0' && ch <= '9') || ch == '/' || ch == ':' || ch == '-' || ch == '_' || ch == '.' || ch == '~';
    if (safe) uri.push_back(static_cast<char>(ch));
    else { uri.push_back('%'); uri.push_back(hex[ch >> 4]); uri.push_back(hex[ch & 0x0f]); }
  }
  return uri;
}
} // namespace

namespace winrt::DispatchNative::implementation {

void DispatchWorkspace::Initialize(React::ReactContext const &context) noexcept {
  m_context = context;
  try {
    PWSTR localAppData = nullptr;
    winrt::check_hresult(SHGetKnownFolderPath(FOLDERID_LocalAppData, KF_FLAG_CREATE, nullptr, &localAppData));
    const std::unique_ptr<wchar_t, decltype(&CoTaskMemFree)> localAppDataOwner(localAppData, &CoTaskMemFree);
    const auto artifacts = fs::path(localAppDataOwner.get()) / L"Dispatch AI" / L"Artifacts";
    fs::create_directories(artifacts);
    m_artifactDirectory = artifacts.wstring();
  } catch (...) { m_artifactDirectory.clear(); }
}

void DispatchWorkspace::pickWorkspaceDirectory(React::ReactPromise<std::string> &&result) noexcept {
  m_context.UIDispatcher().Post([result = std::move(result)]() mutable {
    try {
      winrt::com_ptr<IFileOpenDialog> dialog;
      winrt::check_hresult(CoCreateInstance(CLSID_FileOpenDialog, nullptr, CLSCTX_INPROC_SERVER, IID_PPV_ARGS(dialog.put())));
      FILEOPENDIALOGOPTIONS options{};
      winrt::check_hresult(dialog->GetOptions(&options));
      winrt::check_hresult(dialog->SetOptions(options | FOS_PICKFOLDERS | FOS_FORCEFILESYSTEM | FOS_PATHMUSTEXIST));
      winrt::check_hresult(dialog->SetTitle(L"Choose a project folder"));
      const auto shown = dialog->Show(GetActiveWindow());
      if (shown == HRESULT_FROM_WIN32(ERROR_CANCELLED)) { result.Resolve(""); return; }
      winrt::check_hresult(shown);
      winrt::com_ptr<IShellItem> item;
      winrt::check_hresult(dialog->GetResult(item.put()));
      PWSTR path = nullptr;
      winrt::check_hresult(item->GetDisplayName(SIGDN_FILESYSPATH, &path));
      const std::wstring selected{path};
      CoTaskMemFree(path);
      result.Resolve(winrt::to_string(winrt::hstring{selected}));
    } catch (winrt::hresult_error const &error) {
      result.Reject(winrt::to_string(error.message()).c_str());
    } catch (std::exception const &error) { result.Reject(error.what()); }
  });
}

void DispatchWorkspace::listWorkspaceFiles(std::string rootPath, std::string relativePath, React::ReactPromise<std::string> &&result) noexcept {
  std::thread([rootPath = std::move(rootPath), relativePath = std::move(relativePath), result = std::move(result)]() mutable {
    try { result.Resolve(listDirectory(rootPath, relativePath)); }
    catch (std::exception const &error) { result.Reject(errorText(error).c_str()); }
  }).detach();
}

void DispatchWorkspace::readWorkspaceText(std::string rootPath, std::string relativePath, double maxBytes, React::ReactPromise<std::string> &&result) noexcept {
  std::thread([rootPath = std::move(rootPath), relativePath = std::move(relativePath), maxBytes, result = std::move(result)]() mutable {
    try { result.Resolve(readText(rootPath, relativePath, maxBytes)); }
    catch (std::exception const &error) { result.Reject(errorText(error).c_str()); }
  }).detach();
}

void DispatchWorkspace::grepWorkspaceText(std::string rootPath, std::string relativePath, std::string query, double maxResults, React::ReactPromise<std::string> &&result) noexcept {
  std::thread([rootPath = std::move(rootPath), relativePath = std::move(relativePath), query = std::move(query), maxResults, result = std::move(result)]() mutable {
    try { result.Resolve(grepText(rootPath, relativePath, query, maxResults)); }
    catch (winrt::hresult_error const &error) { result.Reject(winrt::to_string(error.message()).c_str()); }
    catch (std::exception const &error) { result.Reject(error.what()); }
  }).detach();
}

void DispatchWorkspace::applyWorkspaceFile(std::string rootPath, std::string relativePath, std::string expectedText, std::string replacementText, bool createOnly, React::ReactPromise<std::string> &&result) noexcept {
  std::thread([rootPath = std::move(rootPath), relativePath = std::move(relativePath), expectedText = std::move(expectedText), replacementText = std::move(replacementText), createOnly, result = std::move(result)]() mutable {
    try { result.Resolve(applyTextFile(rootPath, relativePath, expectedText, replacementText, createOnly)); }
    catch (winrt::hresult_error const &error) { result.Reject(winrt::to_string(error.message()).c_str()); }
    catch (std::exception const &error) { result.Reject(error.what()); }
  }).detach();
}

void DispatchWorkspace::removeWorkspaceFile(std::string rootPath, std::string relativePath, std::string expectedText, React::ReactPromise<std::string> &&result) noexcept {
  std::thread([rootPath = std::move(rootPath), relativePath = std::move(relativePath), expectedText = std::move(expectedText), result = std::move(result)]() mutable {
    try { result.Resolve(removeTextFile(rootPath, relativePath, expectedText)); }
    catch (winrt::hresult_error const &error) { result.Reject(winrt::to_string(error.message()).c_str()); }
    catch (std::exception const &error) { result.Reject(error.what()); }
  }).detach();
}

void DispatchWorkspace::pickDesignReferenceImage(React::ReactPromise<std::string> &&result) noexcept {
  const auto directory = fs::path(m_artifactDirectory);
  m_context.UIDispatcher().Post([directory, result = std::move(result)]() mutable {
    try {
      winrt::com_ptr<IFileOpenDialog> dialog;
      winrt::check_hresult(CoCreateInstance(CLSID_FileOpenDialog, nullptr, CLSCTX_INPROC_SERVER, IID_PPV_ARGS(dialog.put())));
      const COMDLG_FILTERSPEC filters[] = {{L"Images (PNG, JPEG, WebP)", L"*.png;*.jpg;*.jpeg;*.webp"}, {L"All files", L"*.*"}};
      winrt::check_hresult(dialog->SetFileTypes(static_cast<UINT>(std::size(filters)), filters));
      winrt::check_hresult(dialog->SetFileTypeIndex(1));
      winrt::check_hresult(dialog->SetTitle(L"Choose a design reference image"));
      const auto shown = dialog->Show(GetActiveWindow());
      if (shown == HRESULT_FROM_WIN32(ERROR_CANCELLED)) { result.Resolve(""); return; }
      winrt::check_hresult(shown);
      winrt::com_ptr<IShellItem> item;
      winrt::check_hresult(dialog->GetResult(item.put()));
      PWSTR displayPath = nullptr;
      winrt::check_hresult(item->GetDisplayName(SIGDN_FILESYSPATH, &displayPath));
      const fs::path source{displayPath};
      CoTaskMemFree(displayPath);
      const auto ext = source.extension().wstring();
      std::string mime;
      if (_wcsicmp(ext.c_str(), L".png") == 0) mime = "image/png";
      else if (_wcsicmp(ext.c_str(), L".jpg") == 0 || _wcsicmp(ext.c_str(), L".jpeg") == 0) mime = "image/jpeg";
      else if (_wcsicmp(ext.c_str(), L".webp") == 0) mime = "image/webp";
      else throw std::runtime_error("Choose a PNG, JPEG, or WebP image.");
      const auto size = fs::file_size(source);
      if (size == 0 || size > 8 * 1024 * 1024) throw std::runtime_error("The design reference must be between 1 byte and 8 MB.");
      fs::create_directories(directory);
      const auto target = directory / (L"dispatch-reference-" + std::to_wstring(GetTickCount64()) + ext);
      fs::copy_file(source, target, fs::copy_options::none);
      const auto uri = pathFileUri(target);
      result.Resolve("{\"uri\":\"" + uri + "\",\"mimeType\":\"" + mime + "\"}");
    } catch (winrt::hresult_error const &error) { result.Reject(winrt::to_string(error.message()).c_str()); }
    catch (std::exception const &error) { result.Reject(error.what()); }
  });
}

void DispatchWorkspace::readDesignReferenceImage(std::string uri, React::ReactPromise<std::string> &&result) noexcept {
  const auto directory = m_artifactDirectory;
  std::thread([uri = std::move(uri), directory, result = std::move(result)]() mutable {
    try { result.Resolve(readDesignImage(uri, directory)); }
    catch (winrt::hresult_error const &error) { result.Reject(winrt::to_string(error.message()).c_str()); }
    catch (std::exception const &error) { result.Reject(error.what()); }
  }).detach();
}

void DispatchWorkspace::saveGeneratedImage(std::string base64Png, std::string fileName, React::ReactPromise<std::string> &&result) noexcept {
  const auto directory = m_artifactDirectory;
  std::thread([base64Png = std::move(base64Png), fileName = std::move(fileName), directory, result = std::move(result)]() mutable {
    try { result.Resolve(savePng(base64Png, fileName, directory)); }
    catch (winrt::hresult_error const &error) { result.Reject(winrt::to_string(error.message()).c_str()); }
    catch (std::exception const &error) { result.Reject(error.what()); }
  }).detach();
}

} // namespace winrt::DispatchNative::implementation
