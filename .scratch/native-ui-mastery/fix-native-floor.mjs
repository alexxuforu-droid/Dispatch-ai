// Rewrite the window-floor block against the installed Windows App SDK 1.8 API.
// The old code used win32::SizeInt32, AppWindow::asWindowHandle and AppWindow::GetDefaultPresenter,
// none of which exist in 1.8, so the project no longer compiled. The floor itself is
// unchanged: it is still the OverlappedPresenter's preferred minimum, still mirrored by
// src/layoutFloor.ts, and still re-applied when the presenter changes.
import fs from 'node:fs';

const file = 'windows/DispatchNative/DispatchNative.cpp';
let text = fs.readFileSync(file, 'utf8');

const start = text.indexOf('  // Get the AppWindow so we can configure its initial title and size');
const end = text.indexOf('  // Get the ReactViewOptions so we can set the initial RN component to load');
if (start < 0 || end < 0 || end < start) { console.error('anchors not found'); process.exit(1); }

const replacement = `  // Get the AppWindow so we can configure its initial title and size
  auto appWindow{reactNativeWin32App.AppWindow()};
  appWindow.Title(L"Dispatch AI");

  // Minimum window size. A desktop build has no 320px target -- that number comes from
  // WCAG's mobile reflow criterion and does not transfer. What matters here is that the
  // task board stays legible and that Windows text scaling (TextScaleFactor runs to 2.25)
  // has room to grow into. Below this the layout stops being usable, so refuse to go there.
  // MIN_WINDOW_WIDTH/HEIGHT in src/layoutFloor.ts mirror these values; a test asserts they
  // have not drifted apart.
  constexpr int32_t kMinWindowWidth = 900;
  constexpr int32_t kMinWindowHeight = 600;
  // The floor is a property of the presenter, so it is set there: an OverlappedPresenter
  // refuses to shrink below its preferred minimum, which is what actually stops the window
  // being dragged narrower. Resize alone would only set the starting size.
  auto applyFloor = [](winrt::Microsoft::UI::Windowing::AppWindow const &window) {
    if (auto presenter = window.Presenter().try_as<winrt::Microsoft::UI::Windowing::OverlappedPresenter>()) {
      presenter.PreferredMinimumWidth(kMinWindowWidth);
      presenter.PreferredMinimumHeight(kMinWindowHeight);
    }
  };
  appWindow.SetPresenter(winrt::Microsoft::UI::Windowing::AppWindowPresenterKind::Overlapped);
  applyFloor(appWindow);
  appWindow.Resize({1000, 1000});
  appWindow.Changed([applyFloor](winrt::Microsoft::UI::Windowing::AppWindow const &window, winrt::Microsoft::UI::Windowing::AppWindowChangedEventArgs &args) {
    if (args.DidPresenterChange()) { applyFloor(window); }
  });

`;

text = text.slice(0, start) + replacement + text.slice(end);
fs.writeFileSync(file, text, 'utf8');
console.log('rewrote the window-floor block');
