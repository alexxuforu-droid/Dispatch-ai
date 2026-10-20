const {getDefaultConfig, mergeConfig} = require('@react-native/metro-config');

const fs = require('fs');
const path = require('node:path');

const rnwPath = fs.realpathSync(
  path.resolve(require.resolve('react-native-windows/package.json'), '..'),
);

/**
 * Metro configuration
 * https://facebook.github.io/metro/docs/configuration
 *
 * @type {import('metro-config').MetroConfig}
 */

const config = {
  //
  resolver: {
    // Windows first, so that a package shipping a .windows.js variant gets it rather than
    // the android or ios one.
    platforms: ['windows', 'android', 'ios'],
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
      // "react-native" has to resolve to the React Native Windows runtime, which ships the
      // Windows entry point (index.windows.js) and the Windows Platform module
      // (Libraries/Utilities/Platform.windows.js). The plain react-native package has
      // neither: its Platform module falls back to a shim that imports itself, so Platform
      // comes back undefined and the app dies on "[runtime not ready]: Cannot read property
      // 'OS' of undefined".
      //
      // The redirect covers deep imports too. Leaving them alone mixes the two runtimes in
      // one bundle, and the plain package's Platform shim is exactly the module that fails.
      //
      // resolver.extraNodeModules cannot do this: Metro only consults it when a package is
      // missing from node_modules, and react-native is installed there. resolveRequest runs
      // before the normal resolution, so the redirect happens here.
      if (platform === 'windows' && (moduleName === 'react-native' || moduleName.startsWith('react-native/'))) {
        const subpath = moduleName === 'react-native' ? 'index.windows.js' : moduleName.slice('react-native/'.length);
        const base = path.join(rnwPath, subpath);
        // Metro's own platform order: the Windows variant, then native, then the plain file.
        const filePath = [`${base}.windows.js`, `${base}.native.js`, `${base}.js`, base]
          .find(candidate => fs.existsSync(candidate) && fs.statSync(candidate).isFile());
        if (filePath) return { type: 'sourceFile', filePath };
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
