/**
 * The batch apply path.
 *
 * The defect under test: each file of a proposal was written in sequence with no rollback,
 * and the "applied" state was persisted after the write, so a crash left files changed with
 * no undo path and a half-applied proposal on disk.
 *
 * The contract held here:
 *  - every file of one proposal is written as a unit;
 *  - a failure in the middle restores the files that were already written;
 *  - the applied state must be persisted before the apply counts as successful.
 */

jest.mock('@react-native-async-storage/async-storage', () => require('./asyncStorageMock').asyncStorageMock);
jest.mock('react-native', () => ({ Platform: { OS: 'windows' } }));
jest.mock('../src/NativeWorkspace', () => ({
  __esModule: true,
  default: {
    applyWorkspaceFile: jest.fn(),
    removeWorkspaceFile: jest.fn(),
  },
}));

import DispatchWorkspace from '../src/NativeWorkspace';
import { applyProjectChanges } from '../src/persistence/workspaceProject';

const workspace = DispatchWorkspace as unknown as { applyWorkspaceFile: jest.Mock; removeWorkspaceFile: jest.Mock };

const ROOT = 'C:\\work';
const changes = [
  { path: 'src/one.ts', before: 'one-before', after: 'one-after' },
  { path: 'src/two.ts', before: 'two-before', after: 'two-after' },
];

beforeEach(() => {
  workspace.applyWorkspaceFile.mockReset();
  workspace.removeWorkspaceFile.mockReset();
  workspace.applyWorkspaceFile.mockImplementation(async (_root: string, _path: string, _expected: string, replacement: string) => replacement);
});

describe('a proposal is applied as a unit', () => {
  test('every file is written and the applied state is persisted', async () => {
    const persist = jest.fn(async () => undefined);
    const result = await applyProjectChanges(ROOT, changes, persist);
    expect(result.ok).toBe(true);
    expect(result.written).toEqual(['src/one.ts', 'src/two.ts']);
    expect(result.rolledBack).toEqual([]);
    expect(result.failed).toBeNull();
    expect(persist).toHaveBeenCalledTimes(1);
  });

  test('a failure in the middle restores the files that were already written', async () => {
    workspace.applyWorkspaceFile.mockImplementation(async (_root: string, path: string, _expected: string, replacement: string) => {
      if (path === 'src/two.ts') throw new Error('The project file is locked by another process.');
      return replacement;
    });
    const result = await applyProjectChanges(ROOT, changes, async () => undefined);
    expect(result.ok).toBe(false);
    expect(result.failed?.path).toBe('src/two.ts');
    expect(result.failed?.message).toContain('locked by another process');
    expect(result.written).toEqual(['src/one.ts']);
    expect(result.rolledBack).toEqual(['src/one.ts']);
    // The rollback put the original text back.
    expect(workspace.applyWorkspaceFile).toHaveBeenLastCalledWith(ROOT, 'src/one.ts', 'one-after', 'one-before', false);
  });

  test('a file that the proposal creates is removed again when the batch is rolled back', async () => {
    workspace.applyWorkspaceFile.mockImplementation(async (_root: string, path: string, _expected: string, replacement: string) => {
      if (path === 'src/two.ts') throw new Error('The project file is locked by another process.');
      return replacement;
    });
    const result = await applyProjectChanges(ROOT, [
      { path: 'src/new.ts', before: '', after: 'created', createOnly: true },
      { path: 'src/two.ts', before: 'two-before', after: 'two-after' },
    ], async () => undefined);
    expect(result.ok).toBe(false);
    expect(workspace.removeWorkspaceFile).toHaveBeenCalledWith(ROOT, 'src/new.ts', 'created');
    expect(result.rolledBack).toEqual(['src/new.ts']);
  });

  test('the applied state has to be persisted before the apply counts as successful', async () => {
    const result = await applyProjectChanges(ROOT, [changes[0]], async () => { throw new Error('The device is out of space.'); });
    expect(result.ok).toBe(false);
    expect(result.failed?.message).toContain('out of space');
    // The file was written and then put back: no change without an undo path.
    expect(result.written).toEqual(['src/one.ts']);
    expect(result.rolledBack).toEqual(['src/one.ts']);
    expect(workspace.applyWorkspaceFile).toHaveBeenLastCalledWith(ROOT, 'src/one.ts', 'one-after', 'one-before', false);
  });

  test('a file that cannot be restored stays reported as written', async () => {
    workspace.applyWorkspaceFile.mockImplementation(async (_root: string, path: string, _expected: string, replacement: string) => {
      if (path === 'src/two.ts') throw new Error('The project file is locked by another process.');
      if (path === 'src/one.ts' && _expected === 'one-after') throw new Error('The project file is locked by another process.');
      return replacement;
    });
    const result = await applyProjectChanges(ROOT, changes, async () => undefined);
    expect(result.ok).toBe(false);
    expect(result.written).toEqual(['src/one.ts']);
    expect(result.rolledBack).toEqual([]);
  });
});
