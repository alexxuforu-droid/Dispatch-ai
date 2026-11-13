// RNW 0.84's CLI locates MSBuild/VCTools via vswhere, but vswhere's default
// product list excludes Visual Studio Build Tools, so a Build-Tools-only
// machine (e.g. Z:\BuildTools18) is never found and `npm run windows` fails
// with "Could not find MSBuild with VCTools". This patch adds `-products *`
// to the CLI's vswhere invocation so registered Build Tools installs are
// discovered. Idempotent; runs as postinstall after every npm install/ci.
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const here = dirname(fileURLToPath(import.meta.url));
const target = join(
  here,
  '..',
  'node_modules',
  '@react-native-windows',
  'cli',
  'lib-commonjs',
  'utils',
  'vsInstalls.js',
);

if (!existsSync(target)) {
  console.log('fix-rnw-vswhere: @react-native-windows/cli not installed yet, skipping');
  process.exit(0);
}

const original = readFileSync(target, 'utf8');
const needle = 'function enumerateVsInstalls(opts) {\n    const args = [];';
const patched = "function enumerateVsInstalls(opts) {\n    // patched by scripts/fix-rnw-vswhere.mjs: include Build Tools in vswhere discovery\n    const args = ['-products', '*'];";

if (original.includes(patched)) {
  console.log('fix-rnw-vswhere: already patched');
} else if (original.includes(needle)) {
  writeFileSync(target, original.replace(needle, patched));
  console.log('fix-rnw-vswhere: patched vsInstalls.js to pass -products * to vswhere');
} else {
  console.warn('fix-rnw-vswhere: expected vsInstalls.js shape not found; no change made');
  process.exit(1);
}

const devModeTarget = join(
  here,
  '..',
  'node_modules',
  '@react-native-windows',
  'cli',
  'src',
  'powershell',
  'WindowsStoreAppUtils.psm1',
);
const devModeMarker = '# dispatch-ai: Developer Mode already enabled; avoid machine-wide AllTrustedApps elevation';
const devModeNeedle = /function EnableDevmode \{\r?\n    \$RegistryKeyPath = "HKLM:\\SOFTWARE\\Microsoft\\Windows\\CurrentVersion\\AppModelUnlock"/;

if (!existsSync(devModeTarget)) {
  console.error('fix-rnw-vswhere: RNW WindowsStoreAppUtils.psm1 not found');
  process.exit(1);
}

const helper = readFileSync(devModeTarget, 'utf8');
if (helper.includes(devModeMarker)) {
  console.log('fix-rnw-vswhere: Developer Mode elevation bypass already patched');
} else if (devModeNeedle.test(helper)) {
  const newline = helper.includes('\r\n') ? '\r\n' : '\n';
  const developerModeGuard = [
    devModeMarker,
    '    $developerMode = Get-ItemProperty -Path $RegistryKeyPath -Name AllowDevelopmentWithoutDevLicense -ErrorAction SilentlyContinue',
    '    if (($developerMode -ne $null) -and ($developerMode.AllowDevelopmentWithoutDevLicense -eq 1)) {',
    '        return',
    '    }',
  ].join(newline);
  const patchedHelper = helper.replace(
    devModeNeedle,
    (match) => `${match}${newline}${newline}${developerModeGuard}`,
  );
  writeFileSync(devModeTarget, patchedHelper);
  console.log('fix-rnw-vswhere: skip AllTrustedApps elevation when Developer Mode is already enabled');
} else {
  console.error('fix-rnw-vswhere: expected EnableDevmode shape not found; no change made');
  process.exit(1);
}
