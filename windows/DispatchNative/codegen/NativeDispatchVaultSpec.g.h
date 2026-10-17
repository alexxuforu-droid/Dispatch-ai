
/*
 * This file is auto-generated from a NativeModule spec file in js.
 *
 * This is a C++ Spec class that should be used with MakeTurboModuleProvider to register native modules
 * in a way that also verifies at compile time that the native module matches the interface required
 * by the TurboModule JS spec.
 */
#pragma once
// clang-format off


#include <NativeModules.h>
#include <tuple>

namespace dispatchCodegen {

struct DispatchVaultSpec : winrt::Microsoft::ReactNative::TurboModuleSpec {
  static constexpr auto methods = std::tuple{
      Method<void(std::string, Promise<bool>) noexcept>{0, L"hasSecret"},
      Method<void(std::string, Promise<std::string>) noexcept>{1, L"getSecret"},
      Method<void(std::string, std::string, Promise<void>) noexcept>{2, L"setSecret"},
      Method<void(std::string, Promise<void>) noexcept>{3, L"clearSecret"},
  };

  template <class TModule>
  static constexpr void ValidateModule() noexcept {
    constexpr auto methodCheckResults = CheckMethods<TModule, DispatchVaultSpec>();

    REACT_SHOW_METHOD_SPEC_ERRORS(
          0,
          "hasSecret",
          "    REACT_METHOD(hasSecret) void hasSecret(std::string providerId, ::React::ReactPromise<bool> &&result) noexcept { /* implementation */ }\n"
          "    REACT_METHOD(hasSecret) static void hasSecret(std::string providerId, ::React::ReactPromise<bool> &&result) noexcept { /* implementation */ }\n");
    REACT_SHOW_METHOD_SPEC_ERRORS(
          1,
          "getSecret",
          "    REACT_METHOD(getSecret) void getSecret(std::string providerId, ::React::ReactPromise<std::string> &&result) noexcept { /* implementation */ }\n"
          "    REACT_METHOD(getSecret) static void getSecret(std::string providerId, ::React::ReactPromise<std::string> &&result) noexcept { /* implementation */ }\n");
    REACT_SHOW_METHOD_SPEC_ERRORS(
          2,
          "setSecret",
          "    REACT_METHOD(setSecret) void setSecret(std::string providerId, std::string secret, ::React::ReactPromise<void> &&result) noexcept { /* implementation */ }\n"
          "    REACT_METHOD(setSecret) static void setSecret(std::string providerId, std::string secret, ::React::ReactPromise<void> &&result) noexcept { /* implementation */ }\n");
    REACT_SHOW_METHOD_SPEC_ERRORS(
          3,
          "clearSecret",
          "    REACT_METHOD(clearSecret) void clearSecret(std::string providerId, ::React::ReactPromise<void> &&result) noexcept { /* implementation */ }\n"
          "    REACT_METHOD(clearSecret) static void clearSecret(std::string providerId, ::React::ReactPromise<void> &&result) noexcept { /* implementation */ }\n");
  }
};

} // namespace dispatchCodegen
