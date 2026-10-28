import { Agent } from './types';
import { isWorkspaceTool, toolAllowed, toolCallProblem } from './workspaceTools';
import type { WorkspaceToolCall } from './workspaceTools';
import { grepProjectText, listProjectFiles, readProjectText } from '../persistence/workspaceProject';
import { normalizeProposalPath } from './paths';

/** A file staged by an agent, waiting for review. Nothing here has touched the disk. */
export type StagedWorkspaceFile = { path: string; before: string; after: string; createOnly: boolean; owner: string; itemId: string };
/** One tool request from a model reply. The shape is declared with the tool registry. */
export type { WorkspaceToolCall };

/**
 * The workspace tool dispatcher: registry, permissions, path rules and staging.
 *
 * Split out of the model runner so it can be tested without a provider, and so the executor only
 * has to decide when to call it.
 */
export async function runWorkspaceTool(root: string, agent: Agent, itemId: string, call: WorkspaceToolCall, staged: Map<string, StagedWorkspaceFile>): Promise<unknown> {
  if (!root) throw new Error('Choose a project folder in Settings before granting workspace tools.');
  const permissions = agent.permissions ?? { read: false, grep: false, write: false, edit: false };
  const name = call.name;
  // The registry is the authority on what exists and what it needs; the if-chain below only
  // implements them. An undeclared name is rejected here rather than falling through.
  if (!isWorkspaceTool(name)) throw new Error(`Unknown workspace tool "${String(name).slice(0, 40)}". Use only ${'list, read, grep, write, or edit'}.`);
  if (!toolAllowed(name, permissions)) {
    const required = { list: 'Read', read: 'Read', grep: 'Grep', write: 'Write', edit: 'Edit' }[name];
    throw new Error(`${required} permission is off for this agent.`);
  }
  // The contract is checked here as well as in the parser, so a call that never came through the
  // parser cannot reach the project folder either.
  const problem = toolCallProblem(call);
  if (problem) throw new Error(`That tool call does not match the tool contract: ${problem}`);
  const rawPath = call.path ?? '';
  const normalizedPath = rawPath ? normalizeProposalPath(rawPath) : '';
  if (rawPath && !normalizedPath) throw new Error('Use a valid project-relative path without parent traversal.');
  const path = normalizedPath ?? '';
  const key = path.toLowerCase();
  const prior = path ? staged.get(key) : undefined;
  if (prior && prior.owner !== agent.id && ['write', 'edit'].includes(name)) throw new Error('Another agent already staged this file. Coordinate with them instead of overwriting their work.');
  if (name === 'list') {
    const entries = await listProjectFiles(root, path);
    const additions = [...staged.values()].filter(file => file.createOnly && file.path.toLowerCase().startsWith(path ? `${key}/` : '')).map(file => ({ name: file.path.split('/').pop() ?? file.path, relativePath: file.path, type: 'file' as const, size: file.after.length }));
    return [...entries, ...additions.filter(file => !entries.some(entry => entry.relativePath.toLowerCase() === file.relativePath.toLowerCase()))].slice(0, 200);
  }
  if (name === 'read') {
    if (!path) throw new Error('Read needs a project-relative file path.');
    return (prior?.after ?? await readProjectText(root, path)).slice(0, 24000);
  }
  if (name === 'grep') {
    const query = typeof call.query === 'string' ? call.query.trim().slice(0, 160) : '';
    const matches = await grepProjectText(root, path, query);
    const stagedPaths = new Set([...staged.values()].map(file => file.path.toLowerCase()));
    const results = matches.filter(match => !stagedPaths.has(match.path.toLowerCase()));
    const needle = query.toLowerCase();
    for (const file of staged.values()) {
      if (path && file.path.toLowerCase() !== key && !file.path.toLowerCase().startsWith(`${key}/`)) continue;
      file.after.split(/\r?\n/).forEach((line, index) => { if (line.toLowerCase().includes(needle) && results.length < 60) results.push({ path: file.path, line: index + 1, text: line.slice(0, 400) }); });
    }
    return results.slice(0, 60);
  }
  if (name === 'write') {
    if (!path) throw new Error('Write needs a project-relative file path.');
    const content = typeof call.content === 'string' ? call.content : '';
    if (!content || content.length > 80000) throw new Error('Write content must contain 1 to 80,000 characters.');
    if (prior) {
      if (!prior.createOnly || prior.owner !== agent.id) throw new Error('Write creates new files only. Use Edit for an existing file.');
      prior.after = content; prior.itemId = itemId;
      return { staged: true, path, characters: content.length, updated: true };
    }
    const parent = path.split('/').slice(0, -1).join('/');
    const filename = path.split('/').pop()?.toLowerCase();
    const entries = await listProjectFiles(root, parent);
    if (entries.some(entry => entry.name.toLowerCase() === filename)) throw new Error('That file already exists. Use Edit permission to change it.');
    staged.set(key, { path, before: '', after: content, createOnly: true, owner: agent.id, itemId });
    return { staged: true, path, characters: content.length };
  }
  if (name === 'edit') {
    if (!path) throw new Error('Edit needs a project-relative file path.');
    const find = typeof call.find === 'string' ? call.find : '';
    const replacement = typeof call.replace === 'string' ? call.replace : '';
    if (!find || find.length > 12000 || replacement.length > 80000) throw new Error('Edit needs a non-empty exact match and a replacement within the size limits.');
    const current = prior?.after ?? await readProjectText(root, path);
    const first = current.indexOf(find);
    if (first < 0 || current.indexOf(find, first + find.length) >= 0) throw new Error('The exact text must appear once. Read the current file and provide a unique match.');
    const after = current.slice(0, first) + replacement + current.slice(first + find.length);
    if (after.length > 80000) throw new Error('The staged file would exceed 80,000 characters.');
    staged.set(key, { path, before: prior?.before ?? current, after, createOnly: prior?.createOnly ?? false, owner: agent.id, itemId });
    return { staged: true, path, replacedCharacters: find.length, newFileCharacters: after.length };
  }
  throw new Error('Unknown workspace tool. Use only list, read, grep, write, or edit.');
}
