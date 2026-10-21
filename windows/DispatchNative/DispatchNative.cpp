// DispatchNative.cpp : Defines the entry point for the application.
//

#include "pch.h"
#include "DispatchNative.h"

#include "AutolinkedNativeModules.g.h"
#include "DispatchVault.h"
#include "DispatchWorkspace.h"

#include "NativeModules.h"

// A PackageProvider containing any turbo modules you define within this app project
struct CompReactPackageProvider
    : winrt::implements<CompReactPackageProvider, winrt::Microsoft::ReactNative::IReactPackageProvider> {
 public: // IReactPackageProvider
  void CreatePackage(winrt::Microsoft::ReactNative::IReactPackageBuilder const &packageBuilder) noexcept {
    AddAttributedModules(packageBuilder, true);
  }
};

// The entry point of the Win32 application
_Use_decl_annotations_ int CALLBACK WinMain(HINSTANCE instance, HINSTANCE, PSTR /* commandLine */, int showCmd) {
  // Initialize WinRT
  winrt::init_apartment(winrt::apartment_type::single_threaded);

  // Enable per monitor DPI scaling
  SetProcessDpiAwarenessContext(DPI_AWARENESS_CONTEXT_PER_MONITOR_AWARE_V2);

  // Find the path hosting the app exe file
  WCHAR appDirectory[MAX_PATH];
  GetModuleFileNameW(NULL, appDirectory, MAX_PATH);
  PathCchRemoveFileSpec(appDirectory, MAX_PATH);

  // The AsyncStorage native module keeps its SQLite file in the app's package location by
  // default. An unpackaged desktop app has no package identity, so every storage call fails
  // with "The process has no package identity" and the app cannot read or write anything it
  // saved. Point the module at a file the app owns instead.
  try {
    PWSTR localAppData = nullptr;
    if (SUCCEEDED(SHGetKnownFolderPath(FOLDERID_LocalAppData, KF_FLAG_CREATE, nullptr, &localAppData))) {
      std::wstring folder(localAppData);
      CoTaskMemFree(localAppData);
      const std::wstring databaseFolder = folder + L"\\Dispatch AI";
      CreateDirectoryW(databaseFolder.c_str(), nullptr);
      winrt::Windows::ApplicationModel::Core::CoreApplication::Properties().Insert(
          L"React-Native-Community-Async-Storage-Database-Path",
          winrt::box_value(databaseFolder + L"\\AsyncStorage.db"));
    }
  } catch (const winrt::hresult_error &) {
    // Without the property the storage module reports the problem itself, and the app
    // surfaces that in its notice channel.
  }

  // Create a ReactNativeWin32App with the ReactNativeAppBuilder
  auto reactNativeWin32App{winrt::Microsoft::ReactNative::ReactNativeAppBuilder().Build()};

  // Configure the initial InstanceSettings for the app's ReactNativeHost
  auto settings{reactNativeWin32App.ReactNativeHost().InstanceSettings()};
  // Register any autolinked native modules
  RegisterAutolinkedNativeModulePackages(settings.PackageProviders());
  // Register any native modules defined within this app project
  settings.PackageProviders().Append(winrt::make<CompReactPackageProvider>());

#if BUNDLE
  // Load the JS bundle from a file (not Metro):
  // Set the path (on disk) where the .bundle file is located
  settings.BundleRootPath(std::wstring(L"file://").append(appDirectory).append(L"\\Bundle\\").c_str());
  // Set the name of the bundle file (without the .bundle extension)
  settings.JavaScriptBundleFile(L"index.windows");
  // Disable hot reload
  settings.UseFastRefresh(false);
#else
  // Load the JS bundle from Metro
  settings.JavaScriptBundleFile(L"index");
  // Enable hot reload
  settings.UseFastRefresh(true);
#endif
#if _DEBUG
  // For Debug builds
  // Enable Direct Debugging of JS
  settings.UseDirectDebugger(true);
  // Enable the Developer Menu
  settings.UseDeveloperSupport(true);
#else
  // For Release builds:
  // Disable Direct Debugging of JS
  settings.UseDirectDebugger(false);
  // Disable the Developer Menu
  settings.UseDeveloperSupport(false);
#endif

  // Get the AppWindow so we can configure its initial title and size
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
  appWindow.Changed([applyFloor](winrt::Microsoft::UI::Windowing::AppWindow const &window, winrt::Microsoft::UI::Windowing::AppWindowChangedEventArgs const &args) {
    if (args.DidPresenterChange()) { applyFloor(window); }
  });

  // Get the ReactViewOptions so we can set the initial RN component to load
  auto viewOptions{reactNativeWin32App.ReactViewOptions()};
  viewOptions.ComponentName(L"DispatchNative");

  // Start the app
  reactNativeWin32App.Start();
}
