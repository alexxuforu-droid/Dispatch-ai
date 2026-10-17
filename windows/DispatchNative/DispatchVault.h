#pragma once

#include "pch.h"
#include "NativeModules.h"
#include "codegen/NativeDispatchVaultSpec.g.h"

namespace winrt::DispatchNative::implementation {

REACT_MODULE(DispatchVault)
struct DispatchVault {
  using ModuleSpec = dispatchCodegen::DispatchVaultSpec;

  REACT_METHOD(hasSecret)
  void hasSecret(std::string providerId, React::ReactPromise<bool> &&result) noexcept;

  REACT_METHOD(getSecret)
  void getSecret(std::string providerId, React::ReactPromise<std::string> &&result) noexcept;

  REACT_METHOD(setSecret)
  void setSecret(std::string providerId, std::string secret, React::ReactPromise<void> &&result) noexcept;

  REACT_METHOD(clearSecret)
  void clearSecret(std::string providerId, React::ReactPromise<void> &&result) noexcept;
};

} // namespace winrt::DispatchNative::implementation
