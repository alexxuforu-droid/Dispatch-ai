/**
 * RNW's default Developer Mode helper should not request machine-wide elevation when
 * Windows Developer Mode is already enabled for layout deployment.
 */
export {};

declare const __dirname: string;
const fs = require('fs');
const path = require('path');

const helperPath = path.join(
  __dirname,
  '..',
  'node_modules',
  '@react-native-windows',
  'cli',
  'src',
  'powershell',
  'WindowsStoreAppUtils.psm1',
);

test('RNW skips the AllTrustedApps elevation when Developer Mode is already enabled', () => {
  const helper = fs.readFileSync(helperPath, 'utf8');

  const fastPath = helper.indexOf('dispatch-ai: Developer Mode already enabled');
  const allTrustedApps = helper.indexOf('function EnableDevmode');

  expect(fastPath).toBeGreaterThan(allTrustedApps);
  expect(helper.slice(fastPath, fastPath + 500)).toContain('AllowDevelopmentWithoutDevLicense');
  expect(helper.slice(fastPath, fastPath + 500)).toContain('return');
});
