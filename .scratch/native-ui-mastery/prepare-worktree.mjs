// Prepare a worktree so MSBuild can build it without touching the main tree's node_modules.
//
// The rule from the repo notes: a worktree never gets a junction into the shared
// node_modules, because any package manager run inside it then writes through the
// junction into the real tree. These are real copies of the three folders the build
// reads, so a worktree cannot mutate the main tree's dependencies.
//
// The generated C++/WinRT headers are build output and are gitignored, so they are
// copied too; without them the build that skips codegen has nothing to compile.
import fs from 'node:fs';
import path from 'node:path';

const source = 'Z:/Projects/Dispatch AI/native';
const target = process.argv[2];
if (!target) { console.error('usage: prepare-worktree.mjs <worktree>'); process.exit(1); }

function copyDir(from, to) {
  fs.mkdirSync(to, { recursive: true });
  fs.cpSync(from, to, { recursive: true, dereference: true, force: true, errorOnExist: false });
  console.log(`copied ${from} -> ${to}`);
}

const modules = path.join(target, 'node_modules');
fs.mkdirSync(modules, { recursive: true });
copyDir(path.join(source, 'node_modules/react-native-windows'), path.join(modules, 'react-native-windows'));
copyDir(path.join(source, 'node_modules/react-native'), path.join(modules, 'react-native'));
copyDir(
  path.join(source, 'node_modules/@react-native-async-storage/async-storage/windows'),
  path.join(modules, '@react-native-async-storage/async-storage/windows'),
);
copyDir(
  path.join(source, 'windows/DispatchNative/x64/Debug/Generated Files'),
  path.join(target, 'windows/DispatchNative/x64/Debug/Generated Files'),
);
console.log(`worktree ready: ${target}`);
