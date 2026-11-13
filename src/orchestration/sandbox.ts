import { AgentSetup, IdleBehaviour } from './types';

/**
 * The folder an agent works in.
 *
 * An agent can be given its own folder inside the selected project. Everything it makes goes
 * there, so the workspace stays clean and the agent can find its own earlier work.
 *
 * The folder is a hard boundary, not a suggestion. The native file layer resolves every path
 * against the root it is given and refuses anything outside it, so an agent that asks for
 * `..`, for a drive letter or for a symlink gets nothing. The run remembers the folder it was
 * created against, so the files it stages are applied inside that folder and not in the
 * person's project.
 */

/** The folder the always-on worker uses when the chosen agent has no folder of its own. */
export const DEFAULT_SANDBOX_FOLDER = 'Dispatch Agent Projects';

/**
 * The folder name an agent gets when it asks for one and does not name it.
 *
 * It is derived from the agent's own name, so two agents on the same workspace do not land in
 * the same folder by accident.
 */
export function defaultSandboxFolder(agentName: string): string {
  const cleaned = agentName.replace(/[^a-zA-Z0-9 _-]+/g, ' ').replace(/\s+/g, ' ').trim();
  return `${cleaned || 'Agent'} Projects`;
}

/**
 * Whether a folder name can be used on this machine.
 *
 * The native layer refuses the dangerous names anyway. This check exists so the app can say
 * "this name cannot be used" while the person is typing, instead of failing later when the
 * folder is created.
 */
export function isSafeFolderName(name: string): boolean {
  const trimmed = name.trim();
  if (!trimmed || trimmed.length > 60) return false;
  if (trimmed === '.' || trimmed === '..') return false;
  if (/[\\/:*?"<>|]/.test(trimmed)) return false;
  for (let index = 0; index < trimmed.length; index += 1) if (trimmed.charCodeAt(index) <= 0x1f) return false;
  if (trimmed.endsWith('.') || trimmed.endsWith(' ')) return false;
  const stem = trimmed.split('.')[0].toUpperCase();
  if (['CON', 'PRN', 'AUX', 'NUL'].includes(stem)) return false;
  if (/^(COM|LPT)[1-9]$/.test(stem)) return false;
  return true;
}

/**
 * The folder one agent works in.
 *
 * The always-on worker always has one: either the folder its agent asked for, or the shared
 * default, so a turn can never scatter files through the person's project.
 */
export function sandboxFolderFor(agentId: string, setups: Record<string, AgentSetup>): string {
  const own = setups[agentId]?.folder?.trim();
  return own && isSafeFolderName(own) ? own : DEFAULT_SANDBOX_FOLDER;
}

/**
 * What one agent does when there is nothing to do.
 *
 * The default is the free choice: the agent picks what to make, and it does not pick the same
 * thing twice in a row.
 */
export function idleBehaviourFor(agentId: string, setups: Record<string, AgentSetup>): IdleBehaviour {
  return setups[agentId]?.idle ?? 'anything';
}

/**
 * The sentence the worker is told about its folder.
 *
 * It is part of the brief rather than a separate rule, so the agent is not asked to follow one
 * instruction in the task and another in a policy it never sees.
 */
export const ALWAYS_ON_SANDBOX_NOTE = 'Everything you make goes in your own folder inside this workspace. Do not write anywhere else, and do not try to reach files outside it.';
