#include "pch.h"
#include "DispatchCapture.h"

#include <Windows.Graphics.Capture.Interop.h>
#include <d3d11.h>
#include <dxgi1_2.h>
#include <mfapi.h>
#include <mfidl.h>
#include <mfreadwrite.h>
#include <objidl.h>
#include <wincodec.h>
#include <wincrypt.h>
#include <winrt/Windows.Data.Json.h>
#include <winrt/Windows.Graphics.Capture.h>
#include <winrt/Windows.Graphics.DirectX.h>
#include <winrt/Windows.Graphics.DirectX.Direct3D11.h>
#include <windows.graphics.directx.direct3d11.interop.h>

#include <algorithm>
#include <array>
#include <atomic>
#include <chrono>
#include <cmath>
#include <condition_variable>
#include <cstdint>
#include <cstring>
#include <deque>
#include <filesystem>
#include <iomanip>
#include <limits>
#include <memory>
#include <mutex>
#include <optional>
#include <sstream>
#include <stdexcept>
#include <string>
#include <string_view>
#include <thread>
#include <utility>
#include <vector>

namespace winrt::DispatchNative::implementation {
namespace {
using namespace std::chrono;
using namespace winrt::Windows::Data::Json;
using namespace winrt::Windows::Graphics::Capture;
using namespace winrt::Windows::Graphics::DirectX;
using namespace winrt::Windows::Graphics::DirectX::Direct3D11;

constexpr std::size_t kMaxTargets = 512;
constexpr std::size_t kMaxJpegBytes = 3 * 1024 * 1024;
constexpr std::uint64_t kMaxSafeInteger = 9007199254740991ULL;
constexpr long long kCaptureStartupTimeoutMs = 10'000;
constexpr double kMaxActionAgeMs = 2000.0;

using Clock = steady_clock;
using StringPromise = std::shared_ptr<React::ReactPromise<std::string>>;

std::string utf8(std::wstring_view value) {
  if (value.empty()) return {};
  const int length = WideCharToMultiByte(CP_UTF8, 0, value.data(), static_cast<int>(value.size()), nullptr, 0, nullptr, nullptr);
  if (length <= 0) return {};
  std::string result(static_cast<std::size_t>(length), '\0');
  WideCharToMultiByte(CP_UTF8, 0, value.data(), static_cast<int>(value.size()), result.data(), length, nullptr, nullptr);
  return result;
}

std::string jsonEscape(std::string const &value) {
  static constexpr char hex[] = "0123456789abcdef";
  std::string result;
  result.reserve(value.size() + 8);
  for (unsigned char ch : value) {
    switch (ch) {
      case '"': result += "\\\""; break;
      case '\\': result += "\\\\"; break;
      case '\b': result += "\\b"; break;
      case '\f': result += "\\f"; break;
      case '\n': result += "\\n"; break;
      case '\r': result += "\\r"; break;
      case '\t': result += "\\t"; break;
      default:
        if (ch < 0x20) {
          result += "\\u00";
          result.push_back(hex[ch >> 4]);
          result.push_back(hex[ch & 0x0f]);
        } else result.push_back(static_cast<char>(ch));
    }
  }
  return result;
}

std::string hwndText(HWND hwnd) {
  std::ostringstream result;
  result << "0x" << std::hex << std::nouppercase << reinterpret_cast<std::uintptr_t>(hwnd);
  return result.str();
}

HWND parseHwnd(std::string const &value) {
  if (value.size() < 3 || value.size() > 18 || value[0] != '0' || (value[1] != 'x' && value[1] != 'X')) {
    throw std::runtime_error("The selected window handle is invalid.");
  }
  std::uintptr_t parsed = 0;
  for (std::size_t i = 2; i < value.size(); ++i) {
    const char ch = value[i];
    unsigned digit = 0;
    if (ch >= '0' && ch <= '9') digit = static_cast<unsigned>(ch - '0');
    else if (ch >= 'a' && ch <= 'f') digit = static_cast<unsigned>(ch - 'a' + 10);
    else if (ch >= 'A' && ch <= 'F') digit = static_cast<unsigned>(ch - 'A' + 10);
    else throw std::runtime_error("The selected window handle is invalid.");
    if (parsed > (std::numeric_limits<std::uintptr_t>::max() - digit) / 16) throw std::runtime_error("The selected window handle is invalid.");
    parsed = parsed * 16 + digit;
  }
  if (parsed == 0) throw std::runtime_error("The selected window handle is invalid.");
  return reinterpret_cast<HWND>(parsed);
}

std::string processName(DWORD processId) {
  HANDLE process = OpenProcess(PROCESS_QUERY_LIMITED_INFORMATION, FALSE, processId);
  if (!process) return "Unknown";
  std::array<wchar_t, 32768> path{};
  DWORD length = static_cast<DWORD>(path.size());
  const BOOL read = QueryFullProcessImageNameW(process, 0, path.data(), &length);
  CloseHandle(process);
  if (!read || length == 0) return "Unknown";
  std::wstring_view full(path.data(), length);
  const auto slash = full.find_last_of(L"\\/");
  return utf8(slash == std::wstring_view::npos ? full : full.substr(slash + 1));
}

struct WindowEntry {
  HWND hwnd{};
  DWORD processId{};
  std::wstring title;
  std::string process;
};

BOOL CALLBACK collectWindow(HWND hwnd, LPARAM parameter) {
  auto &windows = *reinterpret_cast<std::vector<WindowEntry> *>(parameter);
  if (windows.size() >= kMaxTargets || !IsWindowVisible(hwnd)) return TRUE;
  const int titleLength = GetWindowTextLengthW(hwnd);
  if (titleLength <= 0) return TRUE;
  std::wstring title(static_cast<std::size_t>((std::min)(titleLength, 1024)) + 1, L'\0');
  const int read = GetWindowTextW(hwnd, title.data(), static_cast<int>(title.size()));
  if (read <= 0) return TRUE;
  title.resize(static_cast<std::size_t>((std::min)(read, 1024)));
  DWORD processId = 0;
  GetWindowThreadProcessId(hwnd, &processId);
  if (processId == 0) return TRUE;
  windows.push_back({hwnd, processId, std::move(title), processName(processId)});
  return TRUE;
}

std::string listTargetsJson() {
  std::vector<WindowEntry> windows;
  windows.reserve(64);
  EnumWindows(collectWindow, reinterpret_cast<LPARAM>(&windows));
  std::string result = "{\"targets\":[";
  for (std::size_t i = 0; i < windows.size(); ++i) {
    const auto &entry = windows[i];
    if (i) result.push_back(',');
    result += "{\"hwndHex\":\"" + hwndText(entry.hwnd) + "\",\"title\":\"" + jsonEscape(utf8(entry.title)) +
      "\",\"processId\":" + std::to_string(entry.processId) + ",\"processName\":\"" + jsonEscape(entry.process) + "\"}";
  }
  result += "]}";
  return result;
}

struct TargetDimensions {
  std::uint32_t width{};
  std::uint32_t height{};
};

TargetDimensions scaledDimensions(std::uint32_t width, std::uint32_t height, std::uint32_t maxEdge) {
  if (width < 2 || height < 2) throw std::runtime_error("The selected window is too small to capture safely.");
  const double scale = (std::max)(width, height) > maxEdge ? static_cast<double>(maxEdge) / (std::max)(width, height) : 1.0;
  auto scaledWidth = static_cast<std::uint32_t>((std::max)(1.0, std::round(width * scale)));
  auto scaledHeight = static_cast<std::uint32_t>((std::max)(1.0, std::round(height * scale)));
  // MF's H.264 path needs even dimensions. JPEG and MP4 share the same scaled frame.
  if (scaledWidth > 1 && scaledWidth % 2) --scaledWidth;
  if (scaledHeight > 1 && scaledHeight % 2) --scaledHeight;
  return {scaledWidth, scaledHeight};
}

std::vector<std::uint8_t> scaledBgra(
    IWICImagingFactory *factory,
    std::vector<std::uint8_t> const &pixels,
    std::uint32_t sourceWidth,
    std::uint32_t sourceHeight,
    std::uint32_t targetWidth,
    std::uint32_t targetHeight) {
  if (sourceWidth > 8192 || sourceHeight > 8192 || static_cast<std::uint64_t>(sourceWidth) * sourceHeight > 16ULL * 1024 * 1024) {
    throw std::runtime_error("The selected window is larger than the safe capture limit.");
  }
  const auto expectedSize = static_cast<std::size_t>(sourceWidth) * sourceHeight * 4;
  if (pixels.size() != expectedSize) throw std::runtime_error("The native capture frame had an invalid size.");
  winrt::com_ptr<IWICBitmap> bitmap;
  winrt::check_hresult(factory->CreateBitmapFromMemory(
      sourceWidth, sourceHeight, GUID_WICPixelFormat32bppBGRA, sourceWidth * 4,
      static_cast<UINT>(pixels.size()), const_cast<BYTE *>(pixels.data()), bitmap.put()));
  winrt::com_ptr<IWICBitmapScaler> scaler;
  winrt::check_hresult(factory->CreateBitmapScaler(scaler.put()));
  winrt::check_hresult(scaler->Initialize(bitmap.get(), targetWidth, targetHeight, WICBitmapInterpolationModeFant));
  const auto stride = targetWidth * 4;
  std::vector<std::uint8_t> result(static_cast<std::size_t>(stride) * targetHeight);
  winrt::check_hresult(scaler->CopyPixels(nullptr, stride, static_cast<UINT>(result.size()), result.data()));
  return result;
}

std::vector<std::uint8_t> encodeJpeg(
    IWICImagingFactory *factory,
    std::vector<std::uint8_t> const &pixels,
    std::uint32_t width,
    std::uint32_t height,
    std::uint32_t quality) {
  winrt::com_ptr<IStream> stream;
  winrt::check_hresult(CreateStreamOnHGlobal(nullptr, TRUE, stream.put()));
  winrt::com_ptr<IWICBitmap> bitmap;
  winrt::check_hresult(factory->CreateBitmapFromMemory(
      width, height, GUID_WICPixelFormat32bppBGRA, width * 4,
      static_cast<UINT>(pixels.size()), const_cast<BYTE *>(pixels.data()), bitmap.put()));
  winrt::com_ptr<IWICBitmapEncoder> encoder;
  winrt::check_hresult(factory->CreateEncoder(GUID_ContainerFormatJpeg, nullptr, encoder.put()));
  winrt::check_hresult(encoder->Initialize(stream.get(), WICBitmapEncoderNoCache));
  winrt::com_ptr<IWICBitmapFrameEncode> frame;
  winrt::com_ptr<IPropertyBag2> options;
  winrt::check_hresult(encoder->CreateNewFrame(frame.put(), options.put()));
  PROPBAG2 property{};
  property.pstrName = const_cast<LPOLESTR>(L"ImageQuality");
  VARIANT value{};
  VariantInit(&value);
  value.vt = VT_R4;
  value.fltVal = static_cast<float>(quality) / 100.0f;
  const HRESULT qualityResult = options->Write(1, &property, &value);
  VariantClear(&value);
  winrt::check_hresult(qualityResult);
  winrt::check_hresult(frame->Initialize(options.get()));
  winrt::check_hresult(frame->SetSize(width, height));
  WICPixelFormatGUID format = GUID_WICPixelFormat24bppBGR;
  winrt::check_hresult(frame->SetPixelFormat(&format));
  winrt::check_hresult(frame->WriteSource(bitmap.get(), nullptr));
  winrt::check_hresult(frame->Commit());
  winrt::check_hresult(encoder->Commit());
  STATSTG stat{};
  winrt::check_hresult(stream->Stat(&stat, STATFLAG_NONAME));
  if (stat.cbSize.QuadPart == 0 || stat.cbSize.QuadPart > kMaxJpegBytes) throw std::runtime_error("The encoded frame exceeds the 3 MB JPEG limit.");
  HGLOBAL memory = nullptr;
  winrt::check_hresult(GetHGlobalFromStream(stream.get(), &memory));
  auto *bytes = static_cast<std::uint8_t *>(GlobalLock(memory));
  if (!bytes) throw std::runtime_error("The encoded frame could not be read.");
  std::vector<std::uint8_t> result(bytes, bytes + static_cast<std::size_t>(stat.cbSize.QuadPart));
  GlobalUnlock(memory);
  return result;
}

std::string base64(std::vector<std::uint8_t> const &bytes) {
  if (bytes.empty() || bytes.size() > MAXDWORD) throw std::runtime_error("The encoded frame is empty or too large.");
  DWORD length = 0;
  if (!CryptBinaryToStringA(bytes.data(), static_cast<DWORD>(bytes.size()), CRYPT_STRING_BASE64 | CRYPT_STRING_NOCRLF, nullptr, &length)) {
    throw std::runtime_error("The frame could not be converted to base64.");
  }
  std::string result(length, '\0');
  if (!CryptBinaryToStringA(bytes.data(), static_cast<DWORD>(bytes.size()), CRYPT_STRING_BASE64 | CRYPT_STRING_NOCRLF, result.data(), &length)) {
    throw std::runtime_error("The frame could not be converted to base64.");
  }
  if (!result.empty() && result.back() == '\0') result.pop_back();
  return result;
}

std::wstring recordingPath() {
  PWSTR localAppData = nullptr;
  winrt::check_hresult(SHGetKnownFolderPath(FOLDERID_LocalAppData, KF_FLAG_CREATE, nullptr, &localAppData));
  std::filesystem::path folder(localAppData);
  CoTaskMemFree(localAppData);
  folder /= L"Dispatch AI";
  folder /= L"Recordings";
  std::filesystem::create_directories(folder);
  static std::atomic<std::uint64_t> counter{0};
  const auto stamp = duration_cast<milliseconds>(system_clock::now().time_since_epoch()).count();
  folder /= L"capture-" + std::to_wstring(stamp) + L"-" + std::to_wstring(GetCurrentProcessId()) + L"-" + std::to_wstring(counter.fetch_add(1)) + L".mp4";
  HANDLE reservation = CreateFileW(folder.c_str(), GENERIC_WRITE, 0, nullptr, CREATE_NEW, FILE_ATTRIBUTE_NORMAL, nullptr);
  if (reservation == INVALID_HANDLE_VALUE) throw std::runtime_error("A unique MP4 recording file could not be created.");
  CloseHandle(reservation);
  return folder.wstring();
}

std::string actionReply(char const *status, std::string const &message = {}) {
  std::string result = "{\"status\":\"" + std::string(status) + "\"";
  if (!message.empty()) result += ",\"message\":\"" + jsonEscape(message) + "\"";
  result += "}";
  return result;
}

std::string winrtError(winrt::hresult_error const &error) {
  const auto message = winrt::to_string(error.message());
  return message.empty() ? "The Windows capture operation failed." : message;
}

std::string exceptionText(std::exception const &error) {
  const auto message = std::string(error.what());
  return message.empty() ? "The Windows capture operation failed." : message;
}

bool exactKeys(JsonObject const &object, std::initializer_list<wchar_t const *> keys) {
  if (object.Size() != keys.size()) return false;
  for (auto key : keys) if (!object.HasKey(key)) return false;
  return true;
}

double number(JsonObject const &object, wchar_t const *key) {
  auto value = object.GetNamedValue(key);
  if (value.ValueType() != JsonValueType::Number) throw std::runtime_error("The requested action contains an invalid number.");
  const double result = value.GetNumber();
  if (!std::isfinite(result)) throw std::runtime_error("The requested action contains an invalid number.");
  return result;
}

struct ParsedAction {
  enum class Kind { Click, Type, Press, Scroll } kind{};
  int x{};
  int y{};
  int delta{};
  std::wstring text;
  std::wstring key;
};

ParsedAction parseAction(JsonObject const &envelope, std::uint32_t width, std::uint32_t height, HWND &target, std::uint64_t &sequence) {
  if (!exactKeys(envelope, {L"hwndHex", L"frameSequence", L"action"})) throw std::runtime_error("The action request has unexpected fields.");
  auto targetValue = envelope.GetNamedValue(L"hwndHex");
  if (targetValue.ValueType() != JsonValueType::String) throw std::runtime_error("The action target is invalid.");
  target = parseHwnd(utf8(targetValue.GetString()));
  const double rawSequence = number(envelope, L"frameSequence");
  if (rawSequence < 1 || std::floor(rawSequence) != rawSequence || rawSequence > static_cast<double>(kMaxSafeInteger)) {
    throw std::runtime_error("The action frame sequence is invalid.");
  }
  sequence = static_cast<std::uint64_t>(rawSequence);
  auto value = envelope.GetNamedValue(L"action");
  if (value.ValueType() != JsonValueType::Object) throw std::runtime_error("The requested action is invalid.");
  auto object = value.GetObject();
  if (!object.HasKey(L"type") || object.GetNamedValue(L"type").ValueType() != JsonValueType::String) throw std::runtime_error("The requested action type is invalid.");
  const auto type = object.GetNamedString(L"type");
  ParsedAction action;
  if (type == L"click" || type == L"scroll") {
    if (type == L"click" && !exactKeys(object, {L"type", L"x", L"y"})) throw std::runtime_error("The click action contains unexpected fields.");
    if (type == L"scroll" && !exactKeys(object, {L"type", L"x", L"y", L"delta"})) throw std::runtime_error("The scroll action contains unexpected fields.");
    const double x = number(object, L"x"), y = number(object, L"y");
    if (std::floor(x) != x || std::floor(y) != y || x < 0 || y < 0 || x >= width || y >= height) throw std::runtime_error("The action point is outside the captured window.");
    action.x = static_cast<int>(x);
    action.y = static_cast<int>(y);
    if (type == L"click") action.kind = ParsedAction::Kind::Click;
    else {
      const double delta = number(object, L"delta");
      if (std::floor(delta) != delta || delta < -2000 || delta > 2000) throw std::runtime_error("The scroll amount is outside the supported range.");
      action.kind = ParsedAction::Kind::Scroll;
      action.delta = static_cast<int>(delta);
    }
  } else if (type == L"type") {
    if (!exactKeys(object, {L"type", L"text"}) || object.GetNamedValue(L"text").ValueType() != JsonValueType::String) throw std::runtime_error("The text action is invalid.");
    action.text = object.GetNamedString(L"text");
    if (action.text.empty() || action.text.size() > 500) throw std::runtime_error("The text action must contain 1 to 500 characters.");
    action.kind = ParsedAction::Kind::Type;
  } else if (type == L"press") {
    if (!exactKeys(object, {L"type", L"key"}) || object.GetNamedValue(L"key").ValueType() != JsonValueType::String) throw std::runtime_error("The key action is invalid.");
    action.key = object.GetNamedString(L"key");
    static const std::array<std::wstring_view, 10> allowed = {
      L"Enter", L"Escape", L"Tab", L"Space", L"Backspace", L"Delete", L"ArrowUp", L"ArrowDown", L"ArrowLeft", L"ArrowRight"
    };
    if (std::find(allowed.begin(), allowed.end(), action.key) == allowed.end()) throw std::runtime_error("The requested key is not allowed.");
    action.kind = ParsedAction::Kind::Press;
  } else throw std::runtime_error("The requested action type is not supported.");
  return action;
}

WORD virtualKey(std::wstring const &key) {
  if (key == L"Enter") return VK_RETURN;
  if (key == L"Escape") return VK_ESCAPE;
  if (key == L"Tab") return VK_TAB;
  if (key == L"Space") return VK_SPACE;
  if (key == L"Backspace") return VK_BACK;
  if (key == L"Delete") return VK_DELETE;
  if (key == L"ArrowUp") return VK_UP;
  if (key == L"ArrowDown") return VK_DOWN;
  if (key == L"ArrowLeft") return VK_LEFT;
  if (key == L"ArrowRight") return VK_RIGHT;
  return 0;
}

} // namespace

struct CaptureSession : std::enable_shared_from_this<CaptureSession> {
  struct RawFrame {
    std::uint64_t sequence{};
    double timestampMs{};
    double capturedAtMs{};
    std::uint32_t width{};
    std::uint32_t height{};
    int clientWidth{};
    int clientHeight{};
    std::vector<std::uint8_t> pixels;
  };

  struct EncodedFrame {
    std::uint64_t sequence{};
    double timestampMs{};
    double capturedAtMs{};
    std::uint32_t width{};
    std::uint32_t height{};
    int clientWidth{};
    int clientHeight{};
    std::string jpegBase64;
  };

  struct PendingRead {
    std::uint64_t afterSequence{};
    Clock::time_point deadline;
    StringPromise promise;
  };

  struct FrameMeta {
    std::uint64_t sequence{};
    double capturedAtMs{};
    std::uint32_t width{};
    std::uint32_t height{};
    int clientWidth{};
    int clientHeight{};
  };

  CaptureSession(HWND hwnd, DWORD processId, double fps, std::uint32_t maxEdge, std::uint32_t jpegQuality)
      : m_hwnd(hwnd), m_expectedProcessId(processId), m_fps(fps), m_maxEdge(maxEdge), m_jpegQuality(jpegQuality) {}

  ~CaptureSession() { Stop(); }

  void Start() {
    m_worker = std::thread([this] { Run(); });
    std::unique_lock lock(m_mutex);
    if (!m_changed.wait_for(lock, milliseconds(kCaptureStartupTimeoutMs), [this] { return m_startupComplete; })) {
      m_startupError = "The selected window did not become ready within 10 seconds. Refresh the window list and try again.";
      m_captureError = m_startupError;
      m_stopRequested = true;
      const auto message = m_startupError;
      lock.unlock();
      m_changed.notify_all();
      throw std::runtime_error(message);
    }
    if (!m_startupError.empty()) throw std::runtime_error(m_startupError);
    if (m_stopRequested) {
      throw std::runtime_error(m_captureError.empty()
        ? "Capture stopped before the selected window became ready."
        : m_captureError);
    }
  }

  void Stop() {
    std::lock_guard joinLock(m_stopMutex);
    {
      std::lock_guard lock(m_mutex);
      if (!m_stopped) m_stopRequested = true;
    }
    m_changed.notify_all();
    if (m_worker.joinable() && m_worker.get_id() != std::this_thread::get_id()) m_worker.join();
  }

  bool IsStopped() const {
    std::lock_guard lock(m_mutex);
    return m_stopped;
  }

  void NextFrame(double afterSequence, double timeoutMs, StringPromise promise) {
    if (!std::isfinite(afterSequence) || afterSequence < 0 || std::floor(afterSequence) != afterSequence || afterSequence > static_cast<double>(kMaxSafeInteger)) {
      promise->Reject("The last frame sequence is invalid.");
      return;
    }
    if (!std::isfinite(timeoutMs) || timeoutMs < 0 || timeoutMs > 5000) {
      promise->Reject("The frame wait timeout is invalid.");
      return;
    }
    {
      std::lock_guard lock(m_mutex);
      if (m_stopped || m_stopRequested) {
        promise->Resolve(ReadJsonLocked(nullptr, true));
        return;
      }
      if (m_pendingRead) {
        promise->Reject("Only one frame request can be outstanding.");
        return;
      }
      m_pendingRead = PendingRead{static_cast<std::uint64_t>(afterSequence), Clock::now() + milliseconds(static_cast<long long>(timeoutMs)), std::move(promise)};
    }
    m_changed.notify_one();
  }

  void StartRecording(StringPromise promise) {
    {
      std::lock_guard lock(m_mutex);
      if (m_stopped || m_stopRequested) { promise->Reject("Capture has already stopped."); return; }
      if (m_recording || m_recordingStarting || m_recordingStopping || m_startRecordingPromise) { promise->Reject("A recording is already active."); return; }
      m_recordingError.clear();
      m_recordingPath.clear();
      m_recordedFrames = 0;
      m_recordingTimestampOriginMs.reset();
      m_lastRecordingSampleTime.reset();
      m_recordingStarting = true;
      m_startRecordingPromise = std::move(promise);
    }
    m_changed.notify_one();
  }

  void StopRecording(StringPromise promise) {
    {
      std::lock_guard lock(m_mutex);
      if (m_stopped) {
        promise->Resolve(RecordingJson(false, m_recordingPath, m_recordingError));
        return;
      }
      if (m_stopRequested) {
        promise->Reject("Capture is stopping; the recording will be finalized automatically.");
        return;
      }
      if (m_recordingStarting || (m_startRecordingPromise && !m_recording)) { promise->Reject("The recording is still starting."); return; }
      if (m_recordingStopping || m_stopRecordingPromise) { promise->Reject("The recording is already stopping."); return; }
      if (!m_recording) {
        promise->Resolve(RecordingJson(false, m_recordingPath, m_recordingError));
        return;
      }
      m_recordingStopping = true;
      m_stopRecordingPromise = std::move(promise);
    }
    m_changed.notify_one();
  }

  std::string PerformAction(std::string const &raw) {
    JsonObject envelope;
    try { envelope = JsonObject::Parse(winrt::to_hstring(raw)); }
    catch (winrt::hresult_error const &) { return actionReply("rejected", "The action request was not valid JSON."); }
    FrameMeta frame;
    std::uint64_t lastDelivered = 0;
    double frameAge = 0;
    {
      std::lock_guard lock(m_mutex);
      if (m_stopped || m_stopRequested || !m_lastDeliveredFrame) return actionReply("rejected", "The selected-window capture is no longer active.");
      frame = *m_lastDeliveredFrame;
      lastDelivered = m_lastDeliveredSequence;
      frameAge = duration<double, std::milli>(system_clock::now().time_since_epoch()).count() - frame.capturedAtMs;
      if (frameAge < 0 || frameAge > kMaxActionAgeMs) return actionReply("rejected", "The frame is too old for a safe window action.");
    }

    try {
      HWND requestedTarget = nullptr;
      std::uint64_t sequence = 0;
      auto action = parseAction(envelope, frame.width, frame.height, requestedTarget, sequence);
      if (requestedTarget != m_hwnd) return actionReply("rejected", "The action target does not match the selected window.");
      if (sequence != lastDelivered) return actionReply("rejected", "The action does not match the latest delivered frame.");
      {
        std::lock_guard lock(m_mutex);
        if (m_lastActionSequence == sequence) return actionReply("rejected", "Only one action is allowed for each fresh frame.");
        if (m_lastDeliveredSequence != sequence || m_stopRequested) return actionReply("rejected", "The selected-window frame is no longer current.");
        if (!IsFrameFresh(frame)) return actionReply("rejected", "The frame is too old for a safe window action.");
        m_lastActionSequence = sequence;
      }
      return SendTargetedAction(action, frame);
    } catch (winrt::hresult_error const &error) {
      return actionReply("rejected", winrtError(error));
    } catch (std::exception const &error) {
      return actionReply("rejected", exceptionText(error));
    }
  }

  std::string StopResult() const {
    std::lock_guard lock(m_mutex);
    return m_captureError.empty() ? "{\"stopped\":true}" : "{\"stopped\":true,\"message\":\"" + jsonEscape(m_captureError) + "\"}";
  }

 private:
  void Run() noexcept {
    try {
      winrt::init_apartment(winrt::apartment_type::multi_threaded);
      InitializeCapture();
      bool continueCapture = false;
      {
        std::lock_guard lock(m_mutex);
        m_startupComplete = true;
        continueCapture = !m_stopRequested;
      }
      m_changed.notify_all();
      if (continueCapture) RunWorker();
      CleanupCapture();
    } catch (winrt::hresult_error const &error) {
      SetFatalError(winrtError(error));
      CleanupCapture();
    } catch (std::exception const &error) {
      SetFatalError(exceptionText(error));
      CleanupCapture();
    } catch (...) {
      SetFatalError("An unexpected Windows capture error occurred.");
      CleanupCapture();
    }
    ResolvePendingAfterStop();
    {
      std::lock_guard lock(m_mutex);
      m_stopped = true;
      if (!m_startupComplete) m_startupComplete = true;
    }
    m_changed.notify_all();
    winrt::uninit_apartment();
  }

  void InitializeCapture() {
    DWORD processId = 0;
    const auto foundThread = GetWindowThreadProcessId(m_hwnd, &processId);
    if (!IsWindow(m_hwnd) || !IsWindowVisible(m_hwnd) || foundThread == 0 || processId != m_expectedProcessId) {
      throw std::runtime_error("The selected window changed or closed. Refresh the window list and try again.");
    }
    m_windowThreadId = foundThread;
    m_processHandle = OpenProcess(SYNCHRONIZE | PROCESS_QUERY_LIMITED_INFORMATION, FALSE, m_expectedProcessId);
    if (!m_processHandle) throw std::runtime_error("The selected window's process could not be verified.");
    std::array<wchar_t, 256> className{};
    const int classLength = GetClassNameW(m_hwnd, className.data(), static_cast<int>(className.size()));
    if (classLength <= 0) throw std::runtime_error("The selected window could not be verified.");
    m_windowClass.assign(className.data(), static_cast<std::size_t>(classLength));
    RECT client{};
    if (!GetClientRect(m_hwnd, &client)) throw std::runtime_error("The selected window has no capturable client area.");
    m_initialClientWidth = client.right - client.left;
    m_initialClientHeight = client.bottom - client.top;
    if (m_initialClientWidth <= 0 || m_initialClientHeight <= 0) throw std::runtime_error("The selected window has no capturable client area.");

    auto interop = winrt::get_activation_factory<GraphicsCaptureItem, IGraphicsCaptureItemInterop>();
    winrt::check_hresult(interop->CreateForWindow(m_hwnd, winrt::guid_of<GraphicsCaptureItem>(), winrt::put_abi(m_item)));
    const auto size = m_item.Size();
    if (size.Width <= 0 || size.Height <= 0 || size.Width > 8192 || size.Height > 8192 || static_cast<std::uint64_t>(size.Width) * size.Height > 16ULL * 1024 * 1024) {
      throw std::runtime_error("The selected window is larger than the safe capture limit.");
    }
    m_sourceWidth = static_cast<std::uint32_t>(size.Width);
    m_sourceHeight = static_cast<std::uint32_t>(size.Height);
    const auto output = scaledDimensions(m_sourceWidth, m_sourceHeight, m_maxEdge);
    m_outputWidth = output.width;
    m_outputHeight = output.height;

    const D3D_FEATURE_LEVEL levels[] = {D3D_FEATURE_LEVEL_11_1, D3D_FEATURE_LEVEL_11_0, D3D_FEATURE_LEVEL_10_1, D3D_FEATURE_LEVEL_10_0};
    D3D_FEATURE_LEVEL selected{};
    HRESULT deviceResult = D3D11CreateDevice(nullptr, D3D_DRIVER_TYPE_HARDWARE, nullptr, D3D11_CREATE_DEVICE_BGRA_SUPPORT,
      levels, ARRAYSIZE(levels), D3D11_SDK_VERSION, m_d3dDevice.put(), &selected, m_d3dContext.put());
    if (deviceResult == E_INVALIDARG) {
      deviceResult = D3D11CreateDevice(nullptr, D3D_DRIVER_TYPE_HARDWARE, nullptr, D3D11_CREATE_DEVICE_BGRA_SUPPORT,
        levels + 1, ARRAYSIZE(levels) - 1, D3D11_SDK_VERSION, m_d3dDevice.put(), &selected, m_d3dContext.put());
    }
    if (FAILED(deviceResult)) {
      deviceResult = D3D11CreateDevice(nullptr, D3D_DRIVER_TYPE_WARP, nullptr, D3D11_CREATE_DEVICE_BGRA_SUPPORT,
        levels + 1, ARRAYSIZE(levels) - 1, D3D11_SDK_VERSION, m_d3dDevice.put(), &selected, m_d3dContext.put());
    }
    winrt::check_hresult(deviceResult);
    winrt::com_ptr<IDXGIDevice> dxgiDevice;
    winrt::check_hresult(m_d3dDevice->QueryInterface(IID_PPV_ARGS(dxgiDevice.put())));
    winrt::check_hresult(CreateDirect3D11DeviceFromDXGIDevice(dxgiDevice.get(), reinterpret_cast<::IInspectable **>(winrt::put_abi(m_winrtDevice))));

    D3D11_TEXTURE2D_DESC staging{};
    staging.Width = m_sourceWidth;
    staging.Height = m_sourceHeight;
    staging.MipLevels = 1;
    staging.ArraySize = 1;
    staging.Format = DXGI_FORMAT_B8G8R8A8_UNORM;
    staging.SampleDesc.Count = 1;
    staging.Usage = D3D11_USAGE_STAGING;
    staging.CPUAccessFlags = D3D11_CPU_ACCESS_READ;
    winrt::check_hresult(m_d3dDevice->CreateTexture2D(&staging, nullptr, m_stagingTexture.put()));

    m_framePool = Direct3D11CaptureFramePool::CreateFreeThreaded(m_winrtDevice, DirectXPixelFormat::B8G8R8A8UIntNormalized, 2, size);
    const auto weak = weak_from_this();
    m_frameToken = m_framePool.FrameArrived([weak](Direct3D11CaptureFramePool const &sender, IInspectable const &) {
      if (auto self = weak.lock()) self->OnFrameArrived(sender);
    });
    m_closedToken = m_item.Closed([weak](GraphicsCaptureItem const &, IInspectable const &) {
      if (auto self = weak.lock()) self->OnItemClosed();
    });
    m_captureSession = m_framePool.CreateCaptureSession(m_item);
    m_startedAt = Clock::now();
    m_captureSession.StartCapture();
    winrt::check_hresult(CoCreateInstance(CLSID_WICImagingFactory, nullptr, CLSCTX_INPROC_SERVER, IID_PPV_ARGS(m_wicFactory.put())));
  }

  void OnFrameArrived(Direct3D11CaptureFramePool const &sender) noexcept {
    try {
      auto frame = sender.TryGetNextFrame();
      if (!frame) return;
      const auto size = frame.ContentSize();
      const auto capturedAt = system_clock::now();
      const auto steadyAt = Clock::now();
      std::uint64_t sequence = 0;
      double timestampMs = 0;
      int clientWidth = 0;
      int clientHeight = 0;
      {
        std::lock_guard lock(m_mutex);
        if (m_stopRequested || m_stopped) return;
        ++m_capturedFrames;
        if (size.Width <= 0 || size.Height <= 0 || static_cast<std::uint32_t>(size.Width) != m_sourceWidth || static_cast<std::uint32_t>(size.Height) != m_sourceHeight) {
          ++m_droppedFrames;
          m_captureError = "The selected window changed size. Stop and restart capture to continue.";
          if (m_recording && m_recordingError.empty()) m_recordingError = m_captureError;
          m_stopRequested = true;
          m_changed.notify_all();
          return;
        }
        const auto interval = duration<double>(1.0 / m_fps);
        if (m_lastAcceptedAt.time_since_epoch().count() != 0 && steadyAt - m_lastAcceptedAt < interval) {
          ++m_droppedFrames;
          return;
        }
        m_lastAcceptedAt = steadyAt;
        sequence = ++m_nextSequence;
        timestampMs = duration<double, std::milli>(steadyAt - m_startedAt).count();
        if (!m_firstFrameMs) m_firstFrameMs = timestampMs;
      }
      RECT client{};
      if (!GetClientRect(m_hwnd, &client)) throw std::runtime_error("The selected window client area is no longer available.");
      clientWidth = client.right - client.left;
      clientHeight = client.bottom - client.top;
      if (clientWidth != m_initialClientWidth || clientHeight != m_initialClientHeight) {
        {
          std::lock_guard lock(m_mutex);
          ++m_droppedFrames;
          m_captureError = "The selected window changed size. Stop and restart capture to continue.";
          if (m_recording && m_recordingError.empty()) m_recordingError = m_captureError;
          m_stopRequested = true;
        }
        m_changed.notify_all();
        return;
      }

      std::vector<std::uint8_t> pixels(static_cast<std::size_t>(m_sourceWidth) * m_sourceHeight * 4);
      {
        std::lock_guard graphicsLock(m_graphicsMutex);
        auto surface = frame.Surface();
        auto access = surface.as<::Windows::Graphics::DirectX::Direct3D11::IDirect3DDxgiInterfaceAccess>();
        winrt::com_ptr<ID3D11Texture2D> source;
        winrt::check_hresult(access->GetInterface(__uuidof(ID3D11Texture2D), source.put_void()));
        m_d3dContext->CopyResource(m_stagingTexture.get(), source.get());
        D3D11_MAPPED_SUBRESOURCE mapped{};
        winrt::check_hresult(m_d3dContext->Map(m_stagingTexture.get(), 0, D3D11_MAP_READ, 0, &mapped));
        for (std::uint32_t row = 0; row < m_sourceHeight; ++row) {
          std::memcpy(pixels.data() + static_cast<std::size_t>(row) * m_sourceWidth * 4,
            static_cast<std::uint8_t const *>(mapped.pData) + static_cast<std::size_t>(row) * mapped.RowPitch,
            static_cast<std::size_t>(m_sourceWidth) * 4);
        }
        m_d3dContext->Unmap(m_stagingTexture.get(), 0);
      }
      RawFrame raw{sequence, timestampMs, duration<double, std::milli>(capturedAt.time_since_epoch()).count(),
        m_sourceWidth, m_sourceHeight, clientWidth, clientHeight, std::move(pixels)};
      {
        std::lock_guard lock(m_mutex);
        if (m_stopRequested || m_stopped) return;
        if (m_pendingRaw) ++m_droppedFrames;
        m_pendingRaw = std::move(raw);
        m_recentAccepted.push_back(steadyAt);
        while (!m_recentAccepted.empty() && steadyAt - m_recentAccepted.front() > seconds(1)) m_recentAccepted.pop_front();
      }
      m_changed.notify_one();
    } catch (winrt::hresult_error const &error) {
      SetFatalError(winrtError(error));
    } catch (std::exception const &error) {
      SetFatalError(exceptionText(error));
    } catch (...) {
      SetFatalError("The selected window frame could not be copied.");
    }
  }

  void OnItemClosed() noexcept {
    std::lock_guard lock(m_mutex);
    if (!m_captureError.empty()) return;
    m_captureError = "The selected window was closed during capture.";
    if (m_recording && m_recordingError.empty()) m_recordingError = m_captureError;
    m_stopRequested = true;
    m_changed.notify_all();
  }

  void RunWorker() {
    while (true) {
      std::optional<RawFrame> raw;
      bool startRecording = false;
      bool stopRecording = false;
      {
        std::unique_lock lock(m_mutex);
        auto wake = [this] {
          return m_stopRequested || m_startRecordingPromise || m_stopRecordingPromise || m_pendingRaw ||
            (m_pendingRead && m_latestFrame && m_latestFrame->sequence > m_pendingRead->afterSequence);
        };
        if (m_pendingRead) m_changed.wait_until(lock, m_pendingRead->deadline, wake);
        else m_changed.wait(lock, wake);
        if (m_stopRequested) break;
        if (m_startRecordingPromise) startRecording = true;
        else if (m_stopRecordingPromise) stopRecording = true;
        else if (m_pendingRead && m_latestFrame && m_latestFrame->sequence > m_pendingRead->afterSequence) {
          auto promise = std::move(m_pendingRead->promise);
          m_pendingRead.reset();
          if (m_latestUndelivered) m_latestUndelivered = false;
          ++m_deliveredFrames;
          m_lastDeliveredSequence = m_latestFrame->sequence;
          m_lastActionSequence = 0;
          m_lastDeliveredFrame = FrameMeta{m_latestFrame->sequence, m_latestFrame->capturedAtMs, m_latestFrame->width,
            m_latestFrame->height, m_latestFrame->clientWidth, m_latestFrame->clientHeight};
          promise->Resolve(ReadJsonLocked(&*m_latestFrame, false));
          continue;
        } else if (m_pendingRead && Clock::now() >= m_pendingRead->deadline) {
          auto promise = std::move(m_pendingRead->promise);
          m_pendingRead.reset();
          promise->Resolve(ReadJsonLocked(nullptr, false));
          continue;
        } else if (m_pendingRaw) { raw = std::move(m_pendingRaw); m_pendingRaw.reset(); }
      }

      if (startRecording) ProcessStartRecording();
      else if (stopRecording) ProcessStopRecording();
      else if (raw) ProcessRawFrame(std::move(*raw));
    }
  }

  void ProcessRawFrame(RawFrame raw) noexcept {
    try {
      const auto output = scaledDimensions(raw.width, raw.height, m_maxEdge);
      if (output.width != m_outputWidth || output.height != m_outputHeight) {
        SetFatalError("The selected window changed size. Stop and restart capture to continue.");
        return;
      }
      auto pixels = scaledBgra(m_wicFactory.get(), raw.pixels, raw.width, raw.height, m_outputWidth, m_outputHeight);
      bool recording = false;
      {
        std::lock_guard lock(m_mutex);
        recording = m_recording;
      }
      if (recording) WriteRecordingFrame(raw, pixels);
      auto jpeg = encodeJpeg(m_wicFactory.get(), pixels, m_outputWidth, m_outputHeight, m_jpegQuality);
      EncodedFrame encoded{raw.sequence, raw.timestampMs, raw.capturedAtMs, m_outputWidth, m_outputHeight,
        raw.clientWidth, raw.clientHeight, base64(jpeg)};
      {
        std::lock_guard lock(m_mutex);
        if (m_latestFrame && m_latestUndelivered) ++m_droppedFrames;
        m_latestFrame = std::move(encoded);
        m_latestUndelivered = true;
      }
      m_changed.notify_one();
    } catch (winrt::hresult_error const &error) {
      SetFatalError(winrtError(error));
    } catch (std::exception const &error) {
      SetFatalError(exceptionText(error));
    } catch (...) {
      SetFatalError("The selected window frame could not be encoded.");
    }
  }

  void ProcessStartRecording() noexcept {
    StringPromise promise;
    {
      std::lock_guard lock(m_mutex);
      promise = std::move(m_startRecordingPromise);
    }
    try {
      StartMediaWriter();
      std::wstring path;
      {
        std::lock_guard lock(m_mutex);
        m_recording = true;
        m_recordingStarting = false;
        path = m_recordingPath;
      }
      promise->Resolve(RecordingJson(true, path, {}));
    } catch (winrt::hresult_error const &error) {
      FinalizeRecording();
      const auto message = winrtError(error);
      std::wstring path;
      { std::lock_guard lock(m_mutex); path = std::move(m_recordingPath); m_recording = false; m_recordingStarting = false; m_recordingError = message; }
      if (!path.empty()) DeleteFileW(path.c_str());
      promise->Reject(message.c_str());
    } catch (std::exception const &error) {
      FinalizeRecording();
      const auto message = exceptionText(error);
      std::wstring path;
      { std::lock_guard lock(m_mutex); path = std::move(m_recordingPath); m_recording = false; m_recordingStarting = false; m_recordingError = message; }
      if (!path.empty()) DeleteFileW(path.c_str());
      promise->Reject(message.c_str());
    }
  }

  void ProcessStopRecording() noexcept {
    StringPromise promise;
    {
      std::lock_guard lock(m_mutex);
      promise = std::move(m_stopRecordingPromise);
    }
    CompleteRecordingStop(promise);
  }

  void CompleteRecordingStop(StringPromise const &promise) noexcept {
    FinalizeRecording();
    std::string error;
    std::wstring path;
    std::uint64_t recordedFrames = 0;
    {
      std::lock_guard lock(m_mutex);
      error = m_recordingError;
      path = m_recordingPath;
      recordedFrames = m_recordedFrames;
      if (error.empty() && !path.empty() && recordedFrames == 0) {
        error = "No frames were recorded, so no MP4 was saved.";
        m_recordingError = error;
      }
      m_recordingStopping = false;
      if (!error.empty()) m_recordingPath.clear();
    }
    if (!error.empty()) {
      if (!path.empty()) DeleteFileW(path.c_str());
      path.clear();
    }
    if (promise) promise->Resolve(RecordingJson(false, path, error));
  }

  void StartMediaWriter() {
    winrt::check_hresult(MFStartup(MF_VERSION, MFSTARTUP_LITE));
    m_mediaFoundationStarted = true;
    const auto path = recordingPath();
    {
      std::lock_guard lock(m_mutex);
      m_recordingPath = path;
    }
    m_recordingTimestampOriginMs.reset();
    m_lastRecordingSampleTime.reset();
    winrt::check_hresult(MFCreateSinkWriterFromURL(path.c_str(), nullptr, nullptr, m_sinkWriter.put()));
    winrt::com_ptr<IMFMediaType> output;
    winrt::check_hresult(MFCreateMediaType(output.put()));
    winrt::check_hresult(output->SetGUID(MF_MT_MAJOR_TYPE, MFMediaType_Video));
    winrt::check_hresult(output->SetGUID(MF_MT_SUBTYPE, MFVideoFormat_H264));
    const std::uint64_t targetBitrate = static_cast<std::uint64_t>(m_outputWidth) * m_outputHeight * static_cast<std::uint64_t>(m_fps) / 8;
    const std::uint64_t boundedBitrate = targetBitrate < 1'000'000ULL ? 1'000'000ULL : targetBitrate > 12'000'000ULL ? 12'000'000ULL : targetBitrate;
    const auto bitsPerSecond = static_cast<UINT32>(boundedBitrate);
    winrt::check_hresult(output->SetUINT32(MF_MT_AVG_BITRATE, bitsPerSecond));
    winrt::check_hresult(MFSetAttributeSize(output.get(), MF_MT_FRAME_SIZE, m_outputWidth, m_outputHeight));
    winrt::check_hresult(MFSetAttributeRatio(output.get(), MF_MT_FRAME_RATE, static_cast<UINT32>(m_fps), 1));
    winrt::check_hresult(MFSetAttributeRatio(output.get(), MF_MT_PIXEL_ASPECT_RATIO, 1, 1));
    winrt::check_hresult(output->SetUINT32(MF_MT_INTERLACE_MODE, MFVideoInterlace_Progressive));
    winrt::check_hresult(m_sinkWriter->AddStream(output.get(), &m_streamIndex));

    winrt::com_ptr<IMFMediaType> input;
    winrt::check_hresult(MFCreateMediaType(input.put()));
    winrt::check_hresult(input->SetGUID(MF_MT_MAJOR_TYPE, MFMediaType_Video));
    winrt::check_hresult(input->SetGUID(MF_MT_SUBTYPE, MFVideoFormat_RGB32));
    winrt::check_hresult(MFSetAttributeSize(input.get(), MF_MT_FRAME_SIZE, m_outputWidth, m_outputHeight));
    winrt::check_hresult(MFSetAttributeRatio(input.get(), MF_MT_FRAME_RATE, static_cast<UINT32>(m_fps), 1));
    winrt::check_hresult(MFSetAttributeRatio(input.get(), MF_MT_PIXEL_ASPECT_RATIO, 1, 1));
    winrt::check_hresult(input->SetUINT32(MF_MT_INTERLACE_MODE, MFVideoInterlace_Progressive));
    winrt::check_hresult(input->SetUINT32(MF_MT_DEFAULT_STRIDE, m_outputWidth * 4));
    winrt::check_hresult(m_sinkWriter->SetInputMediaType(m_streamIndex, input.get(), nullptr));
    winrt::check_hresult(m_sinkWriter->BeginWriting());
  }

  void WriteRecordingFrame(RawFrame const &raw, std::vector<std::uint8_t> const &pixels) {
    if (!m_sinkWriter) throw std::runtime_error("The MP4 recording writer is not available.");
    winrt::com_ptr<IMFMediaBuffer> buffer;
    const DWORD byteLength = static_cast<DWORD>(pixels.size());
    winrt::check_hresult(MFCreateMemoryBuffer(byteLength, buffer.put()));
    BYTE *destination = nullptr;
    DWORD maximum = 0, current = 0;
    winrt::check_hresult(buffer->Lock(&destination, &maximum, &current));
    std::memcpy(destination, pixels.data(), byteLength);
    buffer->Unlock();
    winrt::check_hresult(buffer->SetCurrentLength(byteLength));
    winrt::com_ptr<IMFSample> sample;
    winrt::check_hresult(MFCreateSample(sample.put()));
    winrt::check_hresult(sample->AddBuffer(buffer.get()));
    const LONGLONG sampleDuration = static_cast<LONGLONG>(10'000'000.0 / m_fps);
    if (!m_recordingTimestampOriginMs) m_recordingTimestampOriginMs = raw.timestampMs;
    const LONGLONG timestampFromStart = static_cast<LONGLONG>(std::llround((raw.timestampMs - *m_recordingTimestampOriginMs) * 10'000.0));
    const LONGLONG sampleTime = m_lastRecordingSampleTime
      ? std::max(timestampFromStart, *m_lastRecordingSampleTime + sampleDuration)
      : std::max<LONGLONG>(0, timestampFromStart);
    winrt::check_hresult(sample->SetSampleTime(sampleTime));
    winrt::check_hresult(sample->SetSampleDuration(sampleDuration));
    winrt::check_hresult(m_sinkWriter->WriteSample(m_streamIndex, sample.get()));
    m_lastRecordingSampleTime = sampleTime;
    {
      std::lock_guard lock(m_mutex);
      ++m_recordedFrames;
    }
  }

  void FinalizeRecording() noexcept {
    if (m_sinkWriter) {
      const HRESULT result = m_sinkWriter->Finalize();
      m_sinkWriter = nullptr;
      if (m_mediaFoundationStarted) {
        MFShutdown();
        m_mediaFoundationStarted = false;
      }
      {
        std::lock_guard lock(m_mutex);
        m_recording = false;
        if (FAILED(result) && m_recordingError.empty()) m_recordingError = "Media Foundation could not finalize the MP4 recording.";
      }
    } else if (m_mediaFoundationStarted) {
      MFShutdown();
      m_mediaFoundationStarted = false;
      std::lock_guard lock(m_mutex);
      m_recording = false;
    }
  }

  void CleanupCapture() noexcept {
    try {
      std::lock_guard graphicsLock(m_graphicsMutex);
      if (m_framePool) {
        if (m_frameToken.value) m_framePool.FrameArrived(m_frameToken);
        m_framePool.Close();
        m_framePool = nullptr;
      }
      if (m_item && m_closedToken.value) m_item.Closed(m_closedToken);
      if (m_captureSession) { m_captureSession.Close(); m_captureSession = nullptr; }
      if (m_item) m_item = nullptr;
    } catch (...) {}
    if (m_processHandle) { CloseHandle(m_processHandle); m_processHandle = nullptr; }
  }

  void SetFatalError(std::string message) noexcept {
    {
      std::lock_guard lock(m_mutex);
      if (!m_stopRequested && m_capturedFrames > m_deliveredFrames + m_droppedFrames) ++m_droppedFrames;
      if (m_captureError.empty()) m_captureError = message;
      if (m_recording && m_recordingError.empty()) m_recordingError = message;
      if (!m_startupComplete && m_startupError.empty()) m_startupError = std::move(message);
      m_stopRequested = true;
    }
    m_changed.notify_all();
  }

  void ResolvePendingAfterStop() noexcept {
    StringPromise next;
    StringPromise stopRecording;
    StringPromise startRecording;
    {
      std::lock_guard lock(m_mutex);
      if (m_pendingRead) { next = std::move(m_pendingRead->promise); m_pendingRead.reset(); }
      if (m_stopRecordingPromise) stopRecording = std::move(m_stopRecordingPromise);
      if (m_startRecordingPromise) startRecording = std::move(m_startRecordingPromise);
    }
    CompleteRecordingStop(stopRecording);
    if (next) next->Resolve(ReadJson(nullptr, true));
    if (startRecording) {
      {
        std::lock_guard lock(m_mutex);
        m_recordingStarting = false;
      }
      startRecording->Reject("Capture stopped before recording could start.");
    }
  }

  bool IsFrameFresh(FrameMeta const &frame) const {
    const double age = duration<double, std::milli>(system_clock::now().time_since_epoch()).count() - frame.capturedAtMs;
    return age >= 0 && age <= kMaxActionAgeMs;
  }

  std::string SendTargetedAction(ParsedAction const &action, FrameMeta const &frame) {
    if (!IsTargetStillValid(frame)) return actionReply("rejected", "The selected window changed or the displayed frame no longer matches it.");
    if (!IsFrameFresh(frame)) return actionReply("rejected", "The frame is too old for a safe window action.");
    POINT rootPoint{};
    if (action.kind == ParsedAction::Kind::Click || action.kind == ParsedAction::Kind::Scroll) {
      RECT client{};
      if (!GetClientRect(m_hwnd, &client)) return actionReply("rejected", "The selected window has no current client area.");
      const int clientWidth = client.right - client.left;
      const int clientHeight = client.bottom - client.top;
      if (clientWidth != frame.clientWidth || clientHeight != frame.clientHeight || clientWidth <= 0 || clientHeight <= 0) {
        return actionReply("rejected", "The selected window changed size after the frame was captured.");
      }
      rootPoint.x = static_cast<LONG>((static_cast<std::int64_t>(action.x) * clientWidth) / frame.width);
      rootPoint.y = static_cast<LONG>((static_cast<std::int64_t>(action.y) * clientHeight) / frame.height);
    }

    if (action.kind == ParsedAction::Kind::Click || action.kind == ParsedAction::Kind::Scroll) {
      POINT childPoint{};
      HWND destination = deepestChild(m_hwnd, rootPoint, childPoint);
      if (!destination || !IsWindow(destination) || (destination != m_hwnd && !IsChild(m_hwnd, destination))) {
        return actionReply("rejected", "The selected window control could not be verified.");
      }
      if (action.kind == ParsedAction::Kind::Click) {
        if (!IsFrameFresh(frame)) return actionReply("rejected", "The frame is too old for a safe window action.");
        if (!PostMessageW(destination, WM_MOUSEMOVE, 0, MAKELPARAM(childPoint.x, childPoint.y)) ||
            !PostMessageW(destination, WM_LBUTTONDOWN, MK_LBUTTON, MAKELPARAM(childPoint.x, childPoint.y)) ||
            !PostMessageW(destination, WM_LBUTTONUP, 0, MAKELPARAM(childPoint.x, childPoint.y))) {
          return actionReply("rejected", "Windows rejected the selected-window click.");
        }
      } else {
        POINT screen = rootPoint;
        if (!ClientToScreen(m_hwnd, &screen)) return actionReply("rejected", "The selected-window scroll point could not be mapped.");
        if (!IsFrameFresh(frame)) return actionReply("rejected", "The frame is too old for a safe window action.");
        const WPARAM wheel = MAKEWPARAM(0, static_cast<SHORT>(action.delta));
        if (!PostMessageW(destination, WM_MOUSEWHEEL, wheel, MAKELPARAM(screen.x, screen.y))) {
          return actionReply("rejected", "Windows rejected the selected-window scroll.");
        }
      }
      return actionReply("queued", "Windows queued the action for the selected window; its effect is not confirmed.");
    }

    GUITHREADINFO gui{};
    gui.cbSize = sizeof(gui);
    if (!GetGUIThreadInfo(m_windowThreadId, &gui) || !gui.hwndFocus || (gui.hwndFocus != m_hwnd && !IsChild(m_hwnd, gui.hwndFocus))) {
      return actionReply("rejected", "The selected window has no focused control for this keyboard action.");
    }
    if (action.kind == ParsedAction::Kind::Type) {
      if (!IsFrameFresh(frame)) return actionReply("rejected", "The frame is too old for a safe window action.");
      for (wchar_t ch : action.text) {
        if (!PostMessageW(gui.hwndFocus, WM_CHAR, static_cast<WPARAM>(ch), 1)) return actionReply("rejected", "Windows rejected part of the selected-window text action.");
      }
      return actionReply("queued", "Windows queued the action for the selected window; its effect is not confirmed.");
    }
    const WORD key = virtualKey(action.key);
    if (!key) return actionReply("rejected", "The requested key is not allowed.");
    if (!IsFrameFresh(frame)) return actionReply("rejected", "The frame is too old for a safe window action.");
    const LPARAM down = 1;
    const LPARAM up = 1 | (1L << 30) | (1L << 31);
    if (!PostMessageW(gui.hwndFocus, WM_KEYDOWN, key, down) || !PostMessageW(gui.hwndFocus, WM_KEYUP, key, up)) {
      return actionReply("rejected", "Windows rejected the selected-window key action.");
    }
    return actionReply("queued", "Windows queued the action for the selected window; its effect is not confirmed.");
  }

  static HWND deepestChild(HWND root, POINT rootPoint, POINT &childPoint) {
    HWND current = root;
    POINT point = rootPoint;
    for (int depth = 0; depth < 16; ++depth) {
      HWND child = ChildWindowFromPointEx(current, point, CWP_SKIPINVISIBLE | CWP_SKIPDISABLED | CWP_SKIPTRANSPARENT);
      if (!child || child == current || !IsChild(root, child)) break;
      POINT screen = point;
      if (!ClientToScreen(current, &screen) || !ScreenToClient(child, &screen)) break;
      current = child;
      point = screen;
    }
    childPoint = point;
    return current;
  }

  bool IsTargetStillValid(FrameMeta const &frame) const {
    if (!IsWindow(m_hwnd) || !IsWindowVisible(m_hwnd) || IsIconic(m_hwnd) || !m_processHandle || WaitForSingleObject(m_processHandle, 0) != WAIT_TIMEOUT) return false;
    DWORD threadId = 0;
    const DWORD processId = GetWindowThreadProcessId(m_hwnd, &threadId);
    if (processId != m_expectedProcessId || threadId != m_windowThreadId) return false;
    std::array<wchar_t, 256> className{};
    const int length = GetClassNameW(m_hwnd, className.data(), static_cast<int>(className.size()));
    if (length <= 0 || std::wstring_view(className.data(), static_cast<std::size_t>(length)) != m_windowClass) return false;
    RECT client{};
    return GetClientRect(m_hwnd, &client) && client.right - client.left == frame.clientWidth && client.bottom - client.top == frame.clientHeight;
  }

  double fpsLocked() const {
    if (m_recentAccepted.size() < 2) return 0;
    const auto elapsed = duration<double>(m_recentAccepted.back() - m_recentAccepted.front()).count();
    return elapsed <= 0 ? 0 : static_cast<double>(m_recentAccepted.size() - 1) / elapsed;
  }

  std::string ReadJson(EncodedFrame const *frame, bool stopped) const {
    std::lock_guard lock(m_mutex);
    return ReadJsonLocked(frame, stopped);
  }

  std::string ReadJsonLocked(EncodedFrame const *frame, bool stopped) const {
    std::string frameJson = "null";
    if (frame) {
      frameJson = "{\"sequence\":" + std::to_string(frame->sequence) + ",\"timestampMs\":" + numberText(frame->timestampMs) +
        ",\"capturedAtMs\":" + numberText(frame->capturedAtMs) + ",\"width\":" + std::to_string(frame->width) +
        ",\"height\":" + std::to_string(frame->height) + ",\"jpegBase64\":\"" + frame->jpegBase64 + "\"}";
    }
    const auto first = m_firstFrameMs ? numberText(*m_firstFrameMs) : "null";
    const auto message = m_captureError.empty() ? "null" : "\"" + jsonEscape(m_captureError) + "\"";
    return "{\"frame\":" + frameJson + ",\"stopped\":" + (stopped ? "true" : "false") + ",\"message\":" + message +
      ",\"firstFrameMs\":" + first + ",\"capturedFrames\":" + std::to_string(m_capturedFrames) +
      ",\"deliveredFrames\":" + std::to_string(m_deliveredFrames) + ",\"droppedFrames\":" + std::to_string(m_droppedFrames) +
      ",\"fps\":" + numberText(fpsLocked()) + "}";
  }

  static std::string numberText(double value) {
    std::ostringstream text;
    text << std::setprecision(15) << value;
    return text.str();
  }

  static std::string RecordingJson(bool recording, std::wstring const &path, std::string const &message) {
    std::string result = "{\"recording\":" + std::string(recording ? "true" : "false") + ",\"path\":\"" + jsonEscape(utf8(path)) + "\"";
    if (!message.empty()) result += ",\"message\":\"" + jsonEscape(message) + "\"";
    return result + "}";
  }

  HWND m_hwnd{};
  DWORD m_expectedProcessId{};
  DWORD m_windowThreadId{};
  std::wstring m_windowClass;
  int m_initialClientWidth{};
  int m_initialClientHeight{};
  double m_fps{};
  std::uint32_t m_maxEdge{};
  std::uint32_t m_jpegQuality{};
  std::uint32_t m_sourceWidth{};
  std::uint32_t m_sourceHeight{};
  std::uint32_t m_outputWidth{};
  std::uint32_t m_outputHeight{};
  HANDLE m_processHandle{};

  mutable std::mutex m_mutex;
  std::mutex m_stopMutex;
  std::mutex m_graphicsMutex;
  std::condition_variable m_changed;
  std::thread m_worker;
  bool m_startupComplete{};
  bool m_stopped{};
  bool m_stopRequested{};
  bool m_recording{};
  bool m_recordingStarting{};
  bool m_recordingStopping{};
  bool m_latestUndelivered{};
  std::string m_startupError;
  std::string m_captureError;
  std::string m_recordingError;
  std::uint64_t m_capturedFrames{};
  std::uint64_t m_deliveredFrames{};
  std::uint64_t m_droppedFrames{};
  std::uint64_t m_nextSequence{};
  std::uint64_t m_lastDeliveredSequence{};
  std::uint64_t m_lastActionSequence{};
  std::optional<double> m_firstFrameMs;
  Clock::time_point m_startedAt{};
  Clock::time_point m_lastAcceptedAt{};
  std::deque<Clock::time_point> m_recentAccepted;
  std::optional<RawFrame> m_pendingRaw;
  std::optional<EncodedFrame> m_latestFrame;
  std::optional<FrameMeta> m_lastDeliveredFrame;
  std::optional<PendingRead> m_pendingRead;
  StringPromise m_startRecordingPromise;
  StringPromise m_stopRecordingPromise;
  std::uint64_t m_recordedFrames{};
  std::optional<double> m_recordingTimestampOriginMs;
  std::optional<LONGLONG> m_lastRecordingSampleTime;

  GraphicsCaptureItem m_item{nullptr};
  Direct3D11CaptureFramePool m_framePool{nullptr};
  GraphicsCaptureSession m_captureSession{nullptr};
  event_token m_frameToken{};
  event_token m_closedToken{};
  winrt::com_ptr<ID3D11Device> m_d3dDevice;
  winrt::com_ptr<ID3D11DeviceContext> m_d3dContext;
  winrt::com_ptr<ID3D11Texture2D> m_stagingTexture;
  IDirect3DDevice m_winrtDevice{nullptr};
  winrt::com_ptr<IWICImagingFactory> m_wicFactory;
  winrt::com_ptr<IMFSinkWriter> m_sinkWriter;
  DWORD m_streamIndex{};
  bool m_mediaFoundationStarted{};
  std::wstring m_recordingPath;
};

DispatchCapture::~DispatchCapture() {
  std::shared_ptr<CaptureSession> session;
  {
    std::lock_guard lock(m_mutex);
    session = std::move(m_session);
  }
  if (session) session->Stop();
}

void DispatchCapture::listTargets(React::ReactPromise<std::string> &&result) noexcept {
  try { result.Resolve(listTargetsJson()); }
  catch (std::exception const &error) { result.Reject(error.what()); }
}

void DispatchCapture::startCapture(std::string hwndHex, double processId, double fps, double maxEdge, double jpegQuality, React::ReactPromise<std::string> &&result) noexcept {
  auto promise = std::make_shared<React::ReactPromise<std::string>>(std::move(result));
  try {
    if (!std::isfinite(processId) || processId < 1 || std::floor(processId) != processId || processId > MAXDWORD) throw std::runtime_error("The selected window process id is invalid.");
    if (!(fps == 5 || fps == 15 || fps == 30)) throw std::runtime_error("Choose a supported capture rate: 5, 15, or 30 FPS.");
    if (!(maxEdge == 640 || maxEdge == 1280 || maxEdge == 1920)) throw std::runtime_error("Choose a supported image edge: 640, 1280, or 1920 pixels.");
    if (!(jpegQuality == 50 || jpegQuality == 70 || jpegQuality == 90)) throw std::runtime_error("Choose a supported JPEG quality: 50, 70, or 90 percent.");
    auto hwnd = parseHwnd(hwndHex);
    auto session = std::make_shared<CaptureSession>(hwnd, static_cast<DWORD>(processId), fps, static_cast<std::uint32_t>(maxEdge), static_cast<std::uint32_t>(jpegQuality));
    {
      std::lock_guard lock(m_mutex);
      if (m_session && !m_session->IsStopped()) throw std::runtime_error("A native capture session is already active.");
      m_session = session;
    }
    std::thread([session, promise] {
      try {
        session->Start();
        promise->Resolve("{\"started\":true}");
      } catch (winrt::hresult_error const &error) { promise->Reject(winrtError(error).c_str()); }
      catch (std::exception const &error) { promise->Reject(error.what()); }
      catch (...) { promise->Reject("The Windows capture session could not start."); }
    }).detach();
  } catch (std::exception const &error) { promise->Reject(error.what()); }
}

void DispatchCapture::nextFrame(double afterSequence, double timeoutMs, React::ReactPromise<std::string> &&result) noexcept {
  auto promise = std::make_shared<React::ReactPromise<std::string>>(std::move(result));
  std::shared_ptr<CaptureSession> session;
  {
    std::lock_guard lock(m_mutex);
    session = m_session;
  }
  if (!session) { promise->Resolve("{\"frame\":null,\"stopped\":true,\"firstFrameMs\":null,\"capturedFrames\":0,\"deliveredFrames\":0,\"droppedFrames\":0,\"fps\":0}"); return; }
  session->NextFrame(afterSequence, timeoutMs, std::move(promise));
}

void DispatchCapture::stopCapture(React::ReactPromise<std::string> &&result) noexcept {
  auto promise = std::make_shared<React::ReactPromise<std::string>>(std::move(result));
  std::shared_ptr<CaptureSession> session;
  {
    std::lock_guard lock(m_mutex);
    session = m_session;
  }
  if (!session) { promise->Resolve("{\"stopped\":true}"); return; }
  std::thread([session, promise] {
    session->Stop();
    const auto response = session->StopResult();
    promise->Resolve(response);
  }).detach();
}

void DispatchCapture::startRecording(React::ReactPromise<std::string> &&result) noexcept {
  auto promise = std::make_shared<React::ReactPromise<std::string>>(std::move(result));
  std::shared_ptr<CaptureSession> session;
  {
    std::lock_guard lock(m_mutex);
    session = m_session;
  }
  if (!session) { promise->Reject("Start capture before recording."); return; }
  session->StartRecording(std::move(promise));
}

void DispatchCapture::stopRecording(React::ReactPromise<std::string> &&result) noexcept {
  auto promise = std::make_shared<React::ReactPromise<std::string>>(std::move(result));
  std::shared_ptr<CaptureSession> session;
  {
    std::lock_guard lock(m_mutex);
    session = m_session;
  }
  if (!session) { promise->Resolve("{\"recording\":false,\"path\":\"\"}"); return; }
  session->StopRecording(std::move(promise));
}

void DispatchCapture::performAction(std::string actionJson, React::ReactPromise<std::string> &&result) noexcept {
  try {
    std::shared_ptr<CaptureSession> session;
    {
      std::lock_guard lock(m_mutex);
      session = m_session;
    }
    if (!session) { result.Resolve(actionReply("rejected", "Start capture before sending an action.")); return; }
    result.Resolve(session->PerformAction(actionJson));
  } catch (winrt::hresult_error const &error) { result.Resolve(actionReply("rejected", winrtError(error))); }
  catch (std::exception const &error) { result.Resolve(actionReply("rejected", exceptionText(error))); }
}

} // namespace winrt::DispatchNative::implementation
