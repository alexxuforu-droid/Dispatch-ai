
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

struct WorkspaceSpec : winrt::Microsoft::ReactNative::TurboModuleSpec {
  static constexpr auto methods = std::tuple{
      Method<void(Promise<std::string>) noexcept>{0, L"pickWorkspaceDirectory"},
      Method<void(std::string, std::string, Promise<std::string>) noexcept>{1, L"listWorkspaceFiles"},
      Method<void(std::string, std::string, double, Promise<std::string>) noexcept>{2, L"readWorkspaceText"},
      Method<void(std::string, std::string, std::string, double, Promise<std::string>) noexcept>{3, L"grepWorkspaceText"},
      Method<void(std::string, std::string, std::string, std::string, bool, Promise<std::string>) noexcept>{4, L"applyWorkspaceFile"},
      Method<void(std::string, std::string, std::string, Promise<std::string>) noexcept>{5, L"removeWorkspaceFile"},
      Method<void(std::string, std::string, Promise<std::string>) noexcept>{6, L"ensureWorkspaceDirectory"},
      Method<void(Promise<std::string>) noexcept>{7, L"pickDesignReferenceImage"},
      Method<void(std::string, Promise<std::string>) noexcept>{8, L"readDesignReferenceImage"},
      Method<void(std::string, std::string, Promise<std::string>) noexcept>{9, L"saveGeneratedImage"},
      Method<void(std::string, std::string, Promise<std::optional<std::string>>) noexcept>{10, L"saveExistingFileAs"},
      Method<void(std::string, std::string, Promise<std::optional<std::string>>) noexcept>{11, L"saveTextAs"},
  };

  template <class TModule>
  static constexpr void ValidateModule() noexcept {
    constexpr auto methodCheckResults = CheckMethods<TModule, WorkspaceSpec>();

    REACT_SHOW_METHOD_SPEC_ERRORS(
          0,
          "pickWorkspaceDirectory",
          "    REACT_METHOD(pickWorkspaceDirectory) void pickWorkspaceDirectory(::React::ReactPromise<std::string> &&result) noexcept { /* implementation */ }\n"
          "    REACT_METHOD(pickWorkspaceDirectory) static void pickWorkspaceDirectory(::React::ReactPromise<std::string> &&result) noexcept { /* implementation */ }\n");
    REACT_SHOW_METHOD_SPEC_ERRORS(
          1,
          "listWorkspaceFiles",
          "    REACT_METHOD(listWorkspaceFiles) void listWorkspaceFiles(std::string rootPath, std::string relativePath, ::React::ReactPromise<std::string> &&result) noexcept { /* implementation */ }\n"
          "    REACT_METHOD(listWorkspaceFiles) static void listWorkspaceFiles(std::string rootPath, std::string relativePath, ::React::ReactPromise<std::string> &&result) noexcept { /* implementation */ }\n");
    REACT_SHOW_METHOD_SPEC_ERRORS(
          2,
          "readWorkspaceText",
          "    REACT_METHOD(readWorkspaceText) void readWorkspaceText(std::string rootPath, std::string relativePath, double maxBytes, ::React::ReactPromise<std::string> &&result) noexcept { /* implementation */ }\n"
          "    REACT_METHOD(readWorkspaceText) static void readWorkspaceText(std::string rootPath, std::string relativePath, double maxBytes, ::React::ReactPromise<std::string> &&result) noexcept { /* implementation */ }\n");
    REACT_SHOW_METHOD_SPEC_ERRORS(
          3,
          "grepWorkspaceText",
          "    REACT_METHOD(grepWorkspaceText) void grepWorkspaceText(std::string rootPath, std::string relativePath, std::string query, double maxResults, ::React::ReactPromise<std::string> &&result) noexcept { /* implementation */ }\n"
          "    REACT_METHOD(grepWorkspaceText) static void grepWorkspaceText(std::string rootPath, std::string relativePath, std::string query, double maxResults, ::React::ReactPromise<std::string> &&result) noexcept { /* implementation */ }\n");
    REACT_SHOW_METHOD_SPEC_ERRORS(
          4,
          "applyWorkspaceFile",
          "    REACT_METHOD(applyWorkspaceFile) void applyWorkspaceFile(std::string rootPath, std::string relativePath, std::string expectedText, std::string replacementText, bool createOnly, ::React::ReactPromise<std::string> &&result) noexcept { /* implementation */ }\n"
          "    REACT_METHOD(applyWorkspaceFile) static void applyWorkspaceFile(std::string rootPath, std::string relativePath, std::string expectedText, std::string replacementText, bool createOnly, ::React::ReactPromise<std::string> &&result) noexcept { /* implementation */ }\n");
    REACT_SHOW_METHOD_SPEC_ERRORS(
          5,
          "removeWorkspaceFile",
          "    REACT_METHOD(removeWorkspaceFile) void removeWorkspaceFile(std::string rootPath, std::string relativePath, std::string expectedText, ::React::ReactPromise<std::string> &&result) noexcept { /* implementation */ }\n"
          "    REACT_METHOD(removeWorkspaceFile) static void removeWorkspaceFile(std::string rootPath, std::string relativePath, std::string expectedText, ::React::ReactPromise<std::string> &&result) noexcept { /* implementation */ }\n");
    REACT_SHOW_METHOD_SPEC_ERRORS(
          6,
          "ensureWorkspaceDirectory",
          "    REACT_METHOD(ensureWorkspaceDirectory) void ensureWorkspaceDirectory(std::string rootPath, std::string relativePath, ::React::ReactPromise<std::string> &&result) noexcept { /* implementation */ }\n"
          "    REACT_METHOD(ensureWorkspaceDirectory) static void ensureWorkspaceDirectory(std::string rootPath, std::string relativePath, ::React::ReactPromise<std::string> &&result) noexcept { /* implementation */ }\n");
    REACT_SHOW_METHOD_SPEC_ERRORS(
          7,
          "pickDesignReferenceImage",
          "    REACT_METHOD(pickDesignReferenceImage) void pickDesignReferenceImage(::React::ReactPromise<std::string> &&result) noexcept { /* implementation */ }\n"
          "    REACT_METHOD(pickDesignReferenceImage) static void pickDesignReferenceImage(::React::ReactPromise<std::string> &&result) noexcept { /* implementation */ }\n");
    REACT_SHOW_METHOD_SPEC_ERRORS(
          8,
          "readDesignReferenceImage",
          "    REACT_METHOD(readDesignReferenceImage) void readDesignReferenceImage(std::string uri, ::React::ReactPromise<std::string> &&result) noexcept { /* implementation */ }\n"
          "    REACT_METHOD(readDesignReferenceImage) static void readDesignReferenceImage(std::string uri, ::React::ReactPromise<std::string> &&result) noexcept { /* implementation */ }\n");
    REACT_SHOW_METHOD_SPEC_ERRORS(
          9,
          "saveGeneratedImage",
          "    REACT_METHOD(saveGeneratedImage) void saveGeneratedImage(std::string base64Png, std::string fileName, ::React::ReactPromise<std::string> &&result) noexcept { /* implementation */ }\n"
          "    REACT_METHOD(saveGeneratedImage) static void saveGeneratedImage(std::string base64Png, std::string fileName, ::React::ReactPromise<std::string> &&result) noexcept { /* implementation */ }\n");
    REACT_SHOW_METHOD_SPEC_ERRORS(
          10,
          "saveExistingFileAs",
          "    REACT_METHOD(saveExistingFileAs) void saveExistingFileAs(std::string sourcePath, std::string suggestedName, ::React::ReactPromise<std::optional<std::string>> &&result) noexcept { /* implementation */ }\n"
          "    REACT_METHOD(saveExistingFileAs) static void saveExistingFileAs(std::string sourcePath, std::string suggestedName, ::React::ReactPromise<std::optional<std::string>> &&result) noexcept { /* implementation */ }\n");
    REACT_SHOW_METHOD_SPEC_ERRORS(
          11,
          "saveTextAs",
          "    REACT_METHOD(saveTextAs) void saveTextAs(std::string text, std::string suggestedName, ::React::ReactPromise<std::optional<std::string>> &&result) noexcept { /* implementation */ }\n"
          "    REACT_METHOD(saveTextAs) static void saveTextAs(std::string text, std::string suggestedName, ::React::ReactPromise<std::optional<std::string>> &&result) noexcept { /* implementation */ }\n");
  }
};

} // namespace dispatchCodegen
