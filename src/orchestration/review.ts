import { Agent, Team } from './types';

/** Highest-ranked peer eligible to review the author's work of the given kind: rank >= 4 and strictly above the author. Never the author. */
export function selectPeerReviewer(team: Team, authorId: string, kind: Agent['kinds'][number] = 'code'): Agent | undefined {
  const author = team.agents.find(candidate => candidate.id === authorId);
  return team.agents
    .filter(candidate => candidate.id !== authorId && candidate.kinds.includes(kind) && candidate.kinds.includes('review') && (candidate.rank ?? 1) >= 4 && (candidate.rank ?? 1) > (author?.rank ?? 1))
    .sort((left, right) => (right.rank ?? 1) - (left.rank ?? 1))[0];
}

/** Code reviewer for an item: qualified peer first, then fallbacks that still exclude the author. Undefined means generic model review. */
export function selectCodeReviewer(team: Team, authorId: string): Agent | undefined {
  return selectPeerReviewer(team, authorId)
    ?? team.agents.find(candidate => candidate.id !== authorId && candidate.id === 'reviewer')
    ?? team.agents.find(candidate => candidate.id !== authorId && candidate.kinds.includes('code') && candidate.kinds.includes('review'));
}

/** Visual reviewer for an image item: qualified image peer first, then fallbacks that still exclude the author. Undefined means generic model review. */
export function selectImageReviewer(team: Team, authorId: string): Agent | undefined {
  return selectPeerReviewer(team, authorId, 'image')
    ?? team.agents.find(candidate => candidate.id !== authorId && candidate.id === 'art-critic')
    ?? team.agents.find(candidate => candidate.id !== authorId && candidate.kinds.includes('image') && candidate.kinds.includes('review'))
    ?? team.agents.find(candidate => candidate.id !== authorId && candidate.id === 'reviewer' && candidate.kinds.includes('image'));
}

export type SecretFinding = { path: string; line?: number; pattern: string };

// ponytail: keyword list stays tiny by design; a generic entropy scanner can replace this regex when false-negatives matter.
const secretAssignment = /\b(password|passwd|secret|api[_-]?key)\s*[:=]\s*(["'])[^"']+\2/gi;

/** Static gate over proposed change content: flags obvious hardcoded credential assignments so review fails closed before any model call. */
export function scanSecrets(changes: { path: string; after: string }[]): SecretFinding[] {
  const findings: SecretFinding[] = [];
  for (const change of changes) {
    change.after.split(/\r?\n/).forEach((line, index) => {
      for (const match of line.matchAll(secretAssignment)) {
        if (match[1]) findings.push({ path: change.path, line: index + 1, pattern: match[1].toLowerCase() });
      }
    });
  }
  return findings;
}

/** A hard block by design: there is no override, so a flagged proposal can never reach the project folder by hand. */
export function codeApplySecretBlock(change: { path: string; after: string }): string | null {
  const [finding] = scanSecrets([change]);
  if (!finding) return null;
  return `Refused to apply ${change.path}${finding.line ? `:${finding.line}` : ''}: possible hardcoded ${finding.pattern} assignment. Remove the quoted value and use configuration or a secret store, then apply the revised proposal.`;
}
