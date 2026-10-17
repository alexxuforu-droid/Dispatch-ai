#pragma once

#include "pch.h"
#include "NativeModules.h"
#include "codegen/NativeWorkspaceSpec.g.h"
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

 private:
  React::ReactContext m_context;
  std::wstring m_artifactDirectory;
};

} // namespace winrt::DispatchNative::implementation
