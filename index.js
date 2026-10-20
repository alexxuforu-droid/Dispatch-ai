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

import { AppRegistry } from 'react-native';
import App from './App';
import { name as appName } from './app.json';

AppRegistry.registerComponent(appName, () => App);
