#pragma once

#include "pch.h"
#include "NativeModules.h"
#include "codegen/NativeWorkspaceSpec.g.h"
#include <mutex>
#include <optional>
#include <string>

namespace winrt::DispatchNative::implementation {

REACT_MODULE(DispatchWorkspace)
struct DispatchWorkspace {
  using ModuleSpec = dispatchCodegen::WorkspaceSpec;

  REACT_INIT(Initialize)
  void Initialize(React::ReactContext const &context) noexcept;

  REACT_METHOD(pickWorkspaceDirectory)
  void pickWorkspaceDirectory(React::ReactPromise<std::string> &&result) noexcept;

  REACT_METHOD(listWorkspaceFiles)
  void listWorkspaceFiles(std::string rootPath, std::string relativePath, React::ReactPromise<std::string> &&result) noexcept;

  REACT_METHOD(readWorkspaceText)
  void readWorkspaceText(std::string rootPath, std::string relativePath, double maxBytes, React::ReactPromise<std::string> &&result) noexcept;

  REACT_METHOD(grepWorkspaceText)
  void grepWorkspaceText(std::string rootPath, std::string relativePath, std::string query, double maxResults, React::ReactPromise<std::string> &&result) noexcept;

  REACT_METHOD(applyWorkspaceFile)
  void applyWorkspaceFile(std::string rootPath, std::string relativePath, std::string expectedText, std::string replacementText, bool createOnly, React::ReactPromise<std::string> &&result) noexcept;

  REACT_METHOD(removeWorkspaceFile)
  void removeWorkspaceFile(std::string rootPath, std::string relativePath, std::string expectedText, React::ReactPromise<std::string> &&result) noexcept;

  REACT_METHOD(pickDesignReferenceImage)
  void pickDesignReferenceImage(React::ReactPromise<std::string> &&result) noexcept;

  REACT_METHOD(readDesignReferenceImage)
  void readDesignReferenceImage(std::string uri, React::ReactPromise<std::string> &&result) noexcept;

  REACT_METHOD(saveGeneratedImage)
  void saveGeneratedImage(std::string base64Png, std::string fileName, React::ReactPromise<std::string> &&result) noexcept;

  REACT_METHOD(saveExistingFileAs)
  void saveExistingFileAs(std::string sourcePath, std::string suggestedName, React::ReactPromise<std::optional<std::string>> &&result) noexcept;

  REACT_METHOD(saveTextAs)
  void saveTextAs(std::string text, std::string suggestedName, React::ReactPromise<std::optional<std::string>> &&result) noexcept;

 private:
  React::ReactContext m_context;
  std::wstring m_artifactDirectory;
  // The project the app is working on. The picker sets it, and the workspace calls that
  // already carry the current root keep it current.
  std::wstring m_projectDirectory;
  std::mutex m_projectMutex;
  void rememberProjectRoot(std::string const &rootPath);
  std::wstring currentProjectDirectory();
};

} // namespace winrt::DispatchNative::implementation
