const {getDefaultConfig, mergeConfig} = require('@react-native/metro-config');

const fs = require('fs');
const path = require('node:path');

const rnwPath = fs.realpathSync(
  path.resolve(require.resolve('react-native-windows/package.json'), '..'),
);

//

/**
 * Metro configuration
 * https://facebook.github.io/metro/docs/configuration
 *
 * @type {import('metro-config').MetroConfig}
 */

const config = {
  //
  resolver: {
    // react-native 0.84.1 ships src/private/devsupport/rndevtools/ReactDevToolsSettingsManager
    // as .android.js, .ios.js and .js.flow only -- there is no desktop implementation. On
    // platform=windows Metro cannot resolve it, which fails the entire bundle with a 500 and
    // leaves the app stuck on its loading bar. The android build is safe to reuse here: both
    // of its exports call through an optional-chained native spec, so off Android they are
    // no-ops. DevTools are a developer convenience and the app does not need them to run.
    resolveRequest: (context, moduleName, platform) => {
      // Windows only. Android and iOS each ship a real implementation, and substituting the
      // Android one for them would replace working code with a no-op.
      if (platform === 'windows' && moduleName.endsWith('rndevtools/ReactDevToolsSettingsManager')) {
        return {
          type: 'sourceFile',
          filePath: require.resolve(
            'react-native/src/private/devsupport/rndevtools/ReactDevToolsSettingsManager.android',
          ),
        };
      }
      return context.resolveRequest(context, moduleName, platform);
    },
    //
    blockList: [
      // This stops "npx @react-native-community/cli run-windows" from causing the metro server to crash if its already running
      new RegExp(
        `${path.resolve(__dirname, 'windows').replace(/[/\\]/g, '/')}.*`,
      ),
      // This prevents "npx @react-native-community/cli run-windows" from hitting: EBUSY: resource busy or locked, open msbuild.ProjectImports.zip or other files produced by msbuild
      new RegExp(`${rnwPath}/build/.*`),
      new RegExp(`${rnwPath}/target/.*`),
      /.*\.ProjectImports\.zip/,
    ],
    //
  },
  transformer: {
    getTransformOptions: async () => ({
      transform: {
        experimentalImportSupport: false,
        inlineRequires: true,
      },
    }),
  },
};

module.exports = mergeConfig(getDefaultConfig(__dirname), config);
