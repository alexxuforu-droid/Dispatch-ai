/**
 * The project persistence layer.
 *
 * Every file operation in the app goes through this module, and it is the one place where a
 * mistake destroys somebody's work: the apply path rewrites a file in the user's project. So
 * the contract is held here.
 *
 * The native half of this module is a Windows native module, so it cannot be exercised from
 * jest. What can be held is the half that decides whether the native half is ever reached:
 * the stored project root, and the refusal that every native-backed call makes when the
 * native module is not there. A silent failure here would leave the app showing a confident
 * empty state while nothing was written.
 */
jest.mock('@react-native-async-storage/async-storage', () => require('./asyncStorageMock').asyncStorageMock);

import { resetAsyncStorageMock, storageBacking } from './asyncStorageMock';

const project = require('../src/persistence/workspaceProject') as typeof import('../src/persistence/workspaceProject');

const PROJECT_KEY = 'dispatch.workspace.project.v1';

afterEach(() => { resetAsyncStorageMock(); });

test('the chosen project root is read back from the device', async () => {
  expect(await project.loadProjectRoot()).toBe('');

  storageBacking.set(PROJECT_KEY, 'C:\\work\\dispatch');
  expect(await project.loadProjectRoot()).toBe('C:\\work\\dispatch');
});

test('a project root that was cleared reads back as no project', async () => {
  // The picker stores an empty string when the person cancels, so an empty root is a real
  // state and not a missing one.
  storageBacking.set(PROJECT_KEY, '');
  expect(await project.loadProjectRoot()).toBe('');
});

test('a missing native module is refused out loud, never silently', async () => {
  // Every native-backed call says why it cannot run. A caller that catches this knows the
  // difference between "there is nothing here" and "this build cannot read files".
  await expect(project.listProjectFiles('C:\\work')).rejects.toThrow(/unavailable/i);
  await expect(project.readProjectText('C:\\work', 'notes.md')).rejects.toThrow(/unavailable/i);
  await expect(project.grepProjectText('C:\\work', '', 'needle')).rejects.toThrow(/unavailable/i);
  await expect(project.applyProjectFile('C:\\work', 'notes.md', 'before', 'after', false)).rejects.toThrow(/unavailable/i);
  await expect(project.applyProjectChanges('C:\\work', [{ path: 'notes.md', before: 'before', after: 'after' }], async () => undefined)).rejects.toThrow(/unavailable/i);
  await expect(project.removeProjectFile('C:\\work', 'notes.md', 'before')).rejects.toThrow(/unavailable/i);
  await expect(project.pickDesignReferenceImage()).rejects.toThrow(/unavailable/i);
  await expect(project.saveGeneratedImage('AAA', 'shot.png')).rejects.toThrow(/unavailable/i);
});
