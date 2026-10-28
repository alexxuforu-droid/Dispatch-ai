/**
 * The workspace tool-call contract, pinned end to end.
 *
 * The defect this covers was three shapes in one feature: the prompt told the agent one thing,
 * the parser accepted another, and the dispatcher read a third, with nothing to say they had to
 * agree. These tests hold the prompt, the parser and the dispatcher to one declaration, and hold
 * that a call which does not match it never reaches the project folder.
 */

// The workspace tools talk to the native project folder. The engine's own copy of that module
// is mocked here so the dispatcher can be exercised without a Windows project folder.
jest.mock('../src/persistence/workspaceProject', () => ({
  listProjectFiles: jest.fn(async () => []),
  readProjectText: jest.fn(async () => ''),
  grepProjectText: jest.fn(async () => []),
  applyProjectFile: jest.fn(async () => ''),
}));

import { parseToolCalls } from '../src/orchestration/toolCalls';
import { runWorkspaceTool } from '../src/orchestration/workspaceExecutor';
import type { StagedWorkspaceFile, WorkspaceToolCall } from '../src/orchestration/workspaceExecutor';
import { toolPolicyFor } from '../src/orchestration/workspaceTools';
import type { Agent } from '../src/orchestration/types';

const workspace = jest.requireMock('../src/persistence/workspaceProject') as {
  listProjectFiles: jest.Mock;
  readProjectText: jest.Mock;
  grepProjectText: jest.Mock;
};

const builder: Agent = {
  id: 'builder', name: 'Builder', role: 'Builds code', rank: 2,
  kinds: ['code'], instructions: 'Build.',
  permissions: { read: true, grep: true, write: true, edit: true },
};

function stagedFiles(): Map<string, StagedWorkspaceFile> {
  return new Map<string, StagedWorkspaceFile>();
}

describe('the workspace tool-call contract', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    workspace.listProjectFiles.mockResolvedValue([]);
    workspace.readProjectText.mockResolvedValue('');
    workspace.grepProjectText.mockResolvedValue([]);
  });

  test('a valid call parses and runs', async () => {
    workspace.readProjectText.mockResolvedValue('FROM DISK');
    const parsed = parseToolCalls('{"toolCalls":[{"name":"read","path":"src/a.ts"}]}');
    expect(parsed.kind).toBe('calls');
    if (parsed.kind !== 'calls') throw new Error('the call should have parsed');
    expect(await runWorkspaceTool('Z:/demo', builder, 'work-1', parsed.calls[0], stagedFiles())).toBe('FROM DISK');
    expect(workspace.readProjectText).toHaveBeenCalledWith('Z:/demo', 'src/a.ts');
  });

  test('a renamed argument field is invalid, not a call that runs on a default', () => {
    const parsed = parseToolCalls('{"toolCalls":[{"name":"read","filePath":"src/a.ts"}]}');
    expect(parsed.kind).toBe('invalid');
    expect(workspace.readProjectText).not.toHaveBeenCalled();
  });

  test('an unknown tool name is invalid', () => {
    expect(parseToolCalls('{"toolCalls":[{"name":"delete","path":"src/a.ts"}]}').kind).toBe('invalid');
  });

  test('a path that is not a string is invalid', () => {
    expect(parseToolCalls('{"toolCalls":[{"name":"list","path":42}]}').kind).toBe('invalid');
  });

  test('a reply that mentions tool calls but carries broken JSON is invalid, not none', () => {
    const parsed = parseToolCalls('I will read the file: {"toolCalls":[{"name":"read",]');
    expect(parsed.kind).toBe('invalid');
    expect(parsed.kind).not.toBe('none');
  });

  test('a reply with no tool calls is still none', () => {
    expect(parseToolCalls('{"summary":"done","messages":[]}').kind).toBe('none');
    expect(parseToolCalls('just prose').kind).toBe('none');
  });

  test('a batch is capped at six calls', () => {
    const calls = Array.from({ length: 9 }, (_, index) => ({ name: 'read', path: `src/${index}.ts` }));
    const parsed = parseToolCalls(JSON.stringify({ toolCalls: calls }));
    expect(parsed.kind === 'calls' ? parsed.calls.length : 0).toBe(6);
  });

  test('the dispatcher refuses a malformed call even when the parser is bypassed', async () => {
    const malformed = { name: 'list', path: 42 } as unknown as WorkspaceToolCall;
    await expect(runWorkspaceTool('Z:/demo', builder, 'work-1', malformed, stagedFiles())).rejects.toThrow(/does not match the tool contract/);
    expect(workspace.listProjectFiles).not.toHaveBeenCalled();
  });

  test('the prompt states the fields the parser demands', () => {
    const policy = toolPolicyFor({ enabled: true, permissions: builder.permissions, hasProjectRoot: true });
    expect(policy).toContain('list (read) takes path (optional);');
    expect(policy).toContain('read (read) takes path;');
    expect(policy).toContain('grep (grep) takes path (optional) and query;');
    expect(policy).toContain('write (write) takes path and content;');
    expect(policy).toContain('edit (edit) takes path, find and replace;');
  });
});
