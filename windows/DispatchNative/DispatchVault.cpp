#include "pch.h"
#include "DispatchVault.h"

#include <wincred.h>
#include <string>
#include <stdexcept>

namespace {
std::wstring targetName(std::string const &providerId) {
  std::wstring target = L"Dispatch AI provider:";
  const auto provider = winrt::to_hstring(providerId);
  target.append(provider.c_str());
  return target;
}

std::string errorMessage(char const *operation, DWORD error) {
  return std::string(operation) + " failed (Windows error " + std::to_string(error) + ").";
}

void removeIfPresent(std::string const &providerId) {
  const auto target = targetName(providerId);
  if (!CredDeleteW(target.c_str(), CRED_TYPE_GENERIC, 0)) {
    const auto error = GetLastError();
    if (error != ERROR_NOT_FOUND) throw std::runtime_error(errorMessage("Credential removal", error));
  }
}
} // namespace

namespace winrt::DispatchNative::implementation {

void DispatchVault::hasSecret(std::string providerId, React::ReactPromise<bool> &&result) noexcept {
  PCREDENTIALW credential = nullptr;
  const auto target = targetName(providerId);
  if (CredReadW(target.c_str(), CRED_TYPE_GENERIC, 0, &credential)) {
    CredFree(credential); result.Resolve(true); return;
  }
  const auto error = GetLastError();
  if (error == ERROR_NOT_FOUND) result.Resolve(false);
  else { const auto message = errorMessage("Credential lookup", error); result.Reject(message.c_str()); }
}

void DispatchVault::getSecret(std::string providerId, React::ReactPromise<std::string> &&result) noexcept {
  PCREDENTIALW credential = nullptr;
  const auto target = targetName(providerId);
  if (!CredReadW(target.c_str(), CRED_TYPE_GENERIC, 0, &credential)) {
    const auto error = GetLastError();
    if (error == ERROR_NOT_FOUND) result.Resolve("");
    else { const auto message = errorMessage("Credential lookup", error); result.Reject(message.c_str()); }
    return;
  }

  const auto charCount = credential->CredentialBlobSize / sizeof(wchar_t);
  const std::wstring secret(reinterpret_cast<wchar_t const *>(credential->CredentialBlob), charCount);
  CredFree(credential);
  result.Resolve(winrt::to_string(winrt::hstring{secret}));
}

void DispatchVault::setSecret(std::string providerId, std::string secret, React::ReactPromise<void> &&result) noexcept {
  try {
    const auto secretWide = winrt::to_hstring(secret);
    if (secretWide.size() * sizeof(wchar_t) > CRED_MAX_CREDENTIAL_BLOB_SIZE) {
      result.Reject("The provider key is too long to store in Windows Credential Manager."); return;
    }
    // CredWriteW replaces a generic credential with the same target, so a failed write leaves the previous key intact.
    const auto target = targetName(providerId);
    CREDENTIALW credential{};
    credential.Type = CRED_TYPE_GENERIC;
    credential.TargetName = const_cast<wchar_t *>(target.c_str());
    credential.CredentialBlobSize = static_cast<DWORD>(secretWide.size() * sizeof(wchar_t));
    credential.CredentialBlob = reinterpret_cast<LPBYTE>(const_cast<wchar_t *>(secretWide.c_str()));
    credential.Persist = CRED_PERSIST_LOCAL_MACHINE;
    if (!CredWriteW(&credential, 0)) { const auto message = errorMessage("Credential save", GetLastError()); result.Reject(message.c_str()); return; }
    result.Resolve();
  } catch (std::exception const &error) {
    result.Reject(error.what());
  }
}

void DispatchVault::clearSecret(std::string providerId, React::ReactPromise<void> &&result) noexcept {
  try { removeIfPresent(providerId); result.Resolve(); }
  catch (std::exception const &error) { result.Reject(error.what()); }
}

} // namespace winrt::DispatchNative::implementation
