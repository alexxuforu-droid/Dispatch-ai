/**
 * React Native Windows platform registration.
 *
 * Without this file the community CLI only knows about iOS and Android: there is no
 * `windows` platform, so the Windows-specific Jest preset fails with "'windows' was
 * not found among available platforms" and `run-windows` is not a command. The Windows
 * source folder, solution and app project are discovered from `windows/`, so no paths
 * are hard-coded here.
 */
const { projectConfigWindows } = require('@react-native-windows/cli/lib-commonjs/commands/config/projectConfig');
const { dependencyConfigWindows } = require('@react-native-windows/cli/lib-commonjs/commands/config/dependencyConfig');

/**
 * The React Native Windows command modules locate PowerShell 7 when they are imported, so
 * requiring them eagerly would break every CLI command on a machine without pwsh.exe. The
 * commands are therefore registered as thin wrappers that import the real implementation
 * only when the command actually runs.
 */
function lazyWindowsCommand(name, description) {
  const load = () => {
    try {
      return require('@react-native-windows/cli').commands.find(candidate => candidate.name === name);
    } catch {
      // Import can fail on machines without pwsh.exe; fall back to a bare
      // command so other CLI commands keep working there.
      return undefined;
    }
  };
  return {
    name,
    description,
    // The community CLI reads `options` when registering the command so that
    // option defaults (e.g. --arch x64) are applied by commander. Without this
    // the platform ends up "undefined" and the solution restore fails.
    get options() {
      return load()?.options ?? [];
    },
    func: (...args) => {
      const command = load();
      if (!command) throw new Error(`React Native Windows does not provide the "${name}" command.`);
      return command.func(...args);
    },
  };
}

module.exports = {
  commands: [
    lazyWindowsCommand('run-windows', 'Build and run the app on Windows.'),
    lazyWindowsCommand('codegen-windows', 'Generate the Windows codegen artifacts.'),
    lazyWindowsCommand('autolink-windows', 'Autolink the Windows native modules.'),
  ],
  platforms: {
    windows: {
      npmPackageName: 'react-native-windows',
      projectConfig: projectConfigWindows,
      dependencyConfig: dependencyConfigWindows,
    },
  },
};
