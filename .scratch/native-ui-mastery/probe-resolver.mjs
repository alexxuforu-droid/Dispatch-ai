// Resolve 'react-native' for platform=windows through the project's own metro resolver,
// to see whether the resolveRequest alias is what the bundler will actually use.
import { createResolver } from 'metro-resolver';
import { nodeFileResolve } from 'metro-resolver/src/nodeFileResolve';
import fs from 'node:fs';

const config = await import('../metro.config.js');
const merged = config.default;

// The resolver needs a file map; a minimal one over the project root is enough to answer
// "which file does 'react-native' resolve to".
const projectRoot = merged.projectRoot;
const fileMap = {
  getRealPath: p => p,
  exists: p => fs.existsSync(p),
  isDirectory: p => { try { return fs.statSync(p).isDirectory(); } catch { return false; } },
  resolveAsset: p => p,
  getPackage: p => {
    try {
      const raw = JSON.parse(fs.readFileSync(`${p}/package.json`, 'utf8'));
      return { root: p, packageJson: raw, rootPath: p };
    } catch { return null; }
  },
  redirectPackage: (pkg, target) => ({ ...pkg, root: target, rootPath: target }),
};

const resolve = createResolver({ fileMap, resolveModule: nodeFileResolve, sourceExts: ['js', 'jsx', 'json', 'ts', 'tsx'], mainFields: ['react-native', 'browser', 'main'], platforms: merged.resolver.platforms ?? ['windows', 'android', 'ios'], preferNativePlatform: true, disableHierarchicalLookup: false, unstable_enablePackageExports: true, unstable_conditionNames: ['require', 'import'], extraNodeModules: merged.resolver.extraNodeModules, resolveRequest: merged.resolver.resolveRequest });

for (const specifier of ['react-native', 'react-native/Libraries/Utilities/Platform']) {
  try {
    const resolved = await resolve({ originModulePath: `${projectRoot}/App.tsx`, moduleName: specifier, platform: 'windows' });
    console.log(specifier, '->', resolved.filePath);
  } catch (error) {
    console.log(specifier, '-> FAILED', error.message.split('\n')[0]);
  }
}
