/**
 * @format
 */

// React Native 0.84 sets up its JavaScript environment -- the global `window`, the console
// and error handling, and the batched bridge that the native side calls into -- from
// Libraries/Core/InitializeCore. Nothing in the app's own module graph pulls that module
// in, so the environment is never prepared and the first render fails on "Property
// 'window' doesn't exist" while the native side cannot find the HMRClient module.
// The setup is idempotent, so requiring it here is safe.
require('react-native/Libraries/Core/InitializeCore');

// React Native Windows publishes the native modules on global.nativeModuleProxy, while
// React Native's TurboModuleRegistry reads global.__turboModuleProxy. Nothing bridges the
// two, so every native module -- local storage, the folder picker, the credential vault --
// comes back empty and the app reports that it cannot read what it just saved. The native
// side installs its proxy before the bundle runs, so the bridge is set up here, before any
// module asks for a native module.
if (global.nativeModuleProxy && !global.__turboModuleProxy) {
  global.__turboModuleProxy = name => global.nativeModuleProxy[name] ?? null;
}

import { AppRegistry } from 'react-native';
import App from './App';
import { name as appName } from './app.json';

AppRegistry.registerComponent(appName, () => App);
