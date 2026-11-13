#pragma once

#include "pch.h"
#include "NativeModules.h"
#include "codegen/NativeCaptureSpec.g.h"
#include <memory>
#include <mutex>
#include <string>

namespace winrt::DispatchNative::implementation {

struct CaptureSession;

REACT_MODULE(DispatchCapture)
struct DispatchCapture {
  using ModuleSpec = dispatchCodegen::CaptureSpec;

  ~DispatchCapture();

  REACT_METHOD(listTargets)
  void listTargets(React::ReactPromise<std::string> &&result) noexcept;

  REACT_METHOD(startCapture)
  void startCapture(std::string hwndHex, double processId, double fps, double maxEdge, double jpegQuality, React::ReactPromise<std::string> &&result) noexcept;

  REACT_METHOD(nextFrame)
  void nextFrame(double afterSequence, double timeoutMs, React::ReactPromise<std::string> &&result) noexcept;

  REACT_METHOD(stopCapture)
  void stopCapture(React::ReactPromise<std::string> &&result) noexcept;

  REACT_METHOD(startRecording)
  void startRecording(React::ReactPromise<std::string> &&result) noexcept;

  REACT_METHOD(stopRecording)
  void stopRecording(React::ReactPromise<std::string> &&result) noexcept;

  REACT_METHOD(performAction)
  void performAction(std::string actionJson, React::ReactPromise<std::string> &&result) noexcept;

 private:
  std::mutex m_mutex;
  std::shared_ptr<CaptureSession> m_session;
};

} // namespace winrt::DispatchNative::implementation
