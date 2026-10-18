/**
 * Contract for the declared workspace tool surface.
 *
 * The point of the registry is that the prompt and the dispatcher stop being two hand-kept
 * lists. These tests pin that agreement, because a tool that is callable but undescribed (or
 * described but uncallable) is a capability the operator cannot see or revoke.
 */

import {
  WORKSPACE_TOOLS,
  isWorkspaceTool,
  permissionToolList,
  specFor,
  toolAllowed,
  toolPolicyFor,
} from '../src/orchestration/workspaceTools';
import type { AgentPermissions } from '../src/orchestration/types';

const none: AgentPermissions = { read: false, grep: false, write: false, edit: false };
const readOnly: AgentPermissions = { read: true, grep: false, write: false, edit: false };
const all: AgentPermissions = { read: true, grep: true, write: true, edit: true };

describe('the tool registry', () => {
  it('declares each tool once, with a unique name and a real permission', () => {
    const names = WORKSPACE_TOOLS.map(tool => tool.name);
    expect([...new Set(names)].sort()).toEqual([...names].sort());
    expect(names.sort()).toEqual(['edit', 'grep', 'list', 'read', 'write']);
    for (const tool of WORKSPACE_TOOLS) {
      expect(['read', 'grep', 'write', 'edit']).toContain(tool.permission);
      expect(tool.grant).toBeTruthy();
      expect(tool.rule).toBeTruthy();
    }
  });

  it('recognises exactly the declared tools and nothing else', () => {
    expect(isWorkspaceTool('read')).toBe(true);
    expect(isWorkspaceTool('delete')).toBe(false);
    expect(isWorkspaceTool('run')).toBe(false);
    expect(specFor('write')?.permission).toBe('write');
    expect(specFor('nope')).toBeUndefined();
  });

  it('gates each tool on its declared permission and treats absent as none', () => {
    expect(toolAllowed('list', readOnly)).toBe(true);
    expect(toolAllowed('read', readOnly)).toBe(true);
    expect(toolAllowed('write', readOnly)).toBe(false);
    expect(toolAllowed('edit', none)).toBe(false);
    expect(toolAllowed('grep', all)).toBe(true);
    // An agent with no permission object at all is not implicitly granted anything.
    expect(toolAllowed('list', undefined)).toBe(false);
    expect(toolAllowed('unknown', all)).toBe(false);
  });

  it('lists only the granted tools, and says none when nothing is granted', () => {
    expect(permissionToolList(readOnly)).toBe('list, read');
    expect(permissionToolList(none)).toBe('none');
    expect(permissionToolList(undefined)).toBe('none');
    expect(permissionToolList(all)).toBe('list, read, grep, write (new files only), edit (existing files)');
  });
});

describe('toolPolicyFor', () => {
  it('is empty when the plugin is off, so a disabled plugin costs no prompt tokens', () => {
    expect(toolPolicyFor({ enabled: false, permissions: all, hasProjectRoot: true })).toBe('');
  });

  it('describes every granted tool and withholds every ungranted one', () => {
    const policy = toolPolicyFor({ enabled: true, permissions: readOnly, hasProjectRoot: true });
    expect(policy).toContain('list (read)');
    expect(policy).toContain('read (read)');
    expect(policy).not.toContain('grep (grep)');
    expect(policy).not.toContain('write (write)');
    expect(policy).not.toContain('edit (edit)');
  });

  it('names the tool arguments the agent must send, derived from the registry', () => {
    const policy = toolPolicyFor({ enabled: true, permissions: all, hasProjectRoot: true });
    expect(policy).toContain('query; scans up to 500 files');
    expect(policy).toContain('content; stages a new file');
    expect(policy).toContain('find and replace; replaces one exact unique text match');
  });

  it('states the boundary truthfully rather than claiming one that does not exist', () => {
    expect(toolPolicyFor({ enabled: true, permissions: all, hasProjectRoot: true }))
      .toContain('The selected project folder is the hard boundary.');
    expect(toolPolicyFor({ enabled: true, permissions: all, hasProjectRoot: false }))
      .toContain('No project folder is selected; no project tools are available.');
  });

  it('keeps the untrusted-data rule the executor depends on', () => {
    const policy = toolPolicyFor({ enabled: true, permissions: all, hasProjectRoot: true });
    expect(policy).toContain('untrusted reference data');
    expect(policy).toContain('Changes are staged for review, never written to disk');
  });
});