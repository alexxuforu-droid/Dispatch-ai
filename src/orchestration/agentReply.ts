import { AgentResult } from './coordinator';
import { Team } from './types';
import { firstJsonObject } from './json';
import { normalizeProposalPath } from './paths';

/**
 * Parses an agent's final reply into the coordinator's result shape.
 *
 * A reply that cannot be parsed still has to say something: the raw text becomes the summary so
 * the run keeps the agent's words instead of dropping them on the floor.
 */
export function parseAgentReply(output: string, team: Team, agentName: string, brief: string, allowChanges: boolean): AgentResult {
  const fallback = { summary: output, messages: [{ to: 'team' as const, kind: 'update' as const, text: output }] };
  const value = firstJsonObject(output, candidate => typeof candidate.summary === 'string' && Array.isArray(candidate.messages));
  if (!value) return fallback;
  const summary = typeof value.summary === 'string' ? value.summary.trim() : '';
  if (!summary) return fallback;
  const recipients = new Set(['team', ...team.agents.filter(candidate => candidate.name !== agentName).map(candidate => candidate.name)]);
  const messages = (value.messages as unknown[]).flatMap((raw: unknown) => {
    if (!raw || typeof raw !== 'object') return [];
    const message = raw as Record<string, unknown>;
    const to = typeof message.to === 'string' && recipients.has(message.to) ? message.to : null;
    const kind = ['handoff', 'question', 'finding', 'update'].includes(String(message.kind)) ? message.kind as 'handoff' | 'question' | 'finding' | 'update' : null;
    const text = typeof message.text === 'string' ? message.text.trim().slice(0, 6000) : '';
    return to && kind && text ? [{ to, kind, text }] : [];
  }).slice(0, 8);
  if (messages.length === 0) messages.push({ to: 'team', kind: 'update', text: summary.slice(0, 6000) });
  const result: AgentResult = { summary: summary.slice(0, 12000), messages };
  if (allowChanges && Array.isArray(value.changes)) {
    const references = extractFileReferences(brief);
    const seen = new Set<string>();
    const changes = (value.changes as unknown[]).flatMap((raw: unknown) => {
      if (!raw || typeof raw !== 'object') return [];
      const change = raw as Record<string, unknown>;
      if (typeof change.path !== 'string' || typeof change.content !== 'string' || change.content.length > 80000) return [];
      const path = normalizeProposalPath(change.path);
      if (!path || seen.has(path.toLowerCase())) return [];
      seen.add(path.toLowerCase());
      const referencePath = [...references.keys()].find(candidate => candidate.toLowerCase() === path.toLowerCase());
      const original = referencePath === undefined ? undefined : references.get(referencePath);
      // Existing paths must have been deliberately attached; an unattached path is allowed only as a new file,
      // and the native apply gate will reject it if a file already exists there.
      if (referencePath !== undefined && original === undefined) return [];
      return [{ path: referencePath ?? path, before: original ?? '', after: change.content, createOnly: original === undefined }];
    }).slice(0, 10);
    result.changes = changes;
    if (changes.length) {
      const proposalText = changes.map(change => `Proposed file: ${change.path}\n\n\`\`\`\n${change.after}\n\`\`\``).join('\n\n');
      result.messages = [...(result.messages ?? []), { to: 'team', kind: 'handoff', text: `Reviewed file proposal(s) are ready for the user to inspect:\n\n${proposalText}` }];
    }
  }
  return result;
}

/** The files the user attached to the brief, with their contents. */
function extractFileReferences(brief: string): Map<string, string> {
  const files = new Map<string, string>();
  const pattern = /\{"path":"(?:\\.|[^"\\])*","content":"(?:\\.|[^"\\])*"\}/g;
  for (const match of brief.matchAll(pattern)) {
    try {
      const entry = JSON.parse(match[0]) as { path?: unknown; content?: unknown };
      if (typeof entry.path === 'string' && typeof entry.content === 'string') files.set(entry.path.replace(/\\/g, '/'), entry.content);
    } catch { /* Ignore unrelated JSON in the task. */ }
  }
  return files;
}
