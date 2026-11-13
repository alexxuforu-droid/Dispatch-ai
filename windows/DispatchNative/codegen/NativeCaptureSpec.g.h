
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

struct CaptureSpec : winrt::Microsoft::ReactNative::TurboModuleSpec {
  static constexpr auto methods = std::tuple{
      Method<void(Promise<std::string>) noexcept>{0, L"listTargets"},
      Method<void(std::string, double, double, double, double, Promise<std::string>) noexcept>{1, L"startCapture"},
      Method<void(double, double, Promise<std::string>) noexcept>{2, L"nextFrame"},
      Method<void(Promise<std::string>) noexcept>{3, L"stopCapture"},
      Method<void(Promise<std::string>) noexcept>{4, L"startRecording"},
      Method<void(Promise<std::string>) noexcept>{5, L"stopRecording"},
      Method<void(std::string, Promise<std::string>) noexcept>{6, L"performAction"},
  };

  template <class TModule>
  static constexpr void ValidateModule() noexcept {
    constexpr auto methodCheckResults = CheckMethods<TModule, CaptureSpec>();

    REACT_SHOW_METHOD_SPEC_ERRORS(
          0,
          "listTargets",
          "    REACT_METHOD(listTargets) void listTargets(::React::ReactPromise<std::string> &&result) noexcept { /* implementation */ }\n"
          "    REACT_METHOD(listTargets) static void listTargets(::React::ReactPromise<std::string> &&result) noexcept { /* implementation */ }\n");
    REACT_SHOW_METHOD_SPEC_ERRORS(
          1,
          "startCapture",
          "    REACT_METHOD(startCapture) void startCapture(std::string hwndHex, double processId, double fps, double maxEdge, double jpegQuality, ::React::ReactPromise<std::string> &&result) noexcept { /* implementation */ }\n"
          "    REACT_METHOD(startCapture) static void startCapture(std::string hwndHex, double processId, double fps, double maxEdge, double jpegQuality, ::React::ReactPromise<std::string> &&result) noexcept { /* implementation */ }\n");
    REACT_SHOW_METHOD_SPEC_ERRORS(
          2,
          "nextFrame",
          "    REACT_METHOD(nextFrame) void nextFrame(double afterSequence, double timeoutMs, ::React::ReactPromise<std::string> &&result) noexcept { /* implementation */ }\n"
          "    REACT_METHOD(nextFrame) static void nextFrame(double afterSequence, double timeoutMs, ::React::ReactPromise<std::string> &&result) noexcept { /* implementation */ }\n");
    REACT_SHOW_METHOD_SPEC_ERRORS(
          3,
          "stopCapture",
          "    REACT_METHOD(stopCapture) void stopCapture(::React::ReactPromise<std::string> &&result) noexcept { /* implementation */ }\n"
          "    REACT_METHOD(stopCapture) static void stopCapture(::React::ReactPromise<std::string> &&result) noexcept { /* implementation */ }\n");
    REACT_SHOW_METHOD_SPEC_ERRORS(
          4,
          "startRecording",
          "    REACT_METHOD(startRecording) void startRecording(::React::ReactPromise<std::string> &&result) noexcept { /* implementation */ }\n"
          "    REACT_METHOD(startRecording) static void startRecording(::React::ReactPromise<std::string> &&result) noexcept { /* implementation */ }\n");
    REACT_SHOW_METHOD_SPEC_ERRORS(
          5,
          "stopRecording",
          "    REACT_METHOD(stopRecording) void stopRecording(::React::ReactPromise<std::string> &&result) noexcept { /* implementation */ }\n"
          "    REACT_METHOD(stopRecording) static void stopRecording(::React::ReactPromise<std::string> &&result) noexcept { /* implementation */ }\n");
    REACT_SHOW_METHOD_SPEC_ERRORS(
          6,
          "performAction",
          "    REACT_METHOD(performAction) void performAction(std::string actionJson, ::React::ReactPromise<std::string> &&result) noexcept { /* implementation */ }\n"
          "    REACT_METHOD(performAction) static void performAction(std::string actionJson, ::React::ReactPromise<std::string> &&result) noexcept { /* implementation */ }\n");
  }
};

} // namespace dispatchCodegen
