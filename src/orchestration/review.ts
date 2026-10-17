import { Agent, Artifact, Run, Team, WorkItem } from './types';
import { AutoReviewer } from './coordinator';

export type CheckResult = { name: string; passed: boolean; detail: string; evidenceUri?: string };
export interface CodeReviewWorker {
  inspect(input: { run: Run; item: WorkItem; artifacts: Artifact[] }): Promise<CheckResult[]>;
}
export interface ImageReviewWorker {
  inspect(input: { run: Run; item: WorkItem; images: Artifact[] }): Promise<CheckResult[]>;
}

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

/** Routes deliverables to format-specific automatic reviewers and fails closed if none are configured. */
export class FormatAwareReviewer implements AutoReviewer {
  constructor(private readonly code?: CodeReviewWorker, private readonly image?: ImageReviewWorker) {}
  async review({ run, item }: { run: Run; item: WorkItem }) {
    if (item.kind === 'code') {
      if (!this.code) return { passed: false, findings: ['Code review is enabled but no code review worker is configured.'] };
      const artifacts = run.artifacts.filter(artifact => artifact.runId === run.id && (artifact.kind === 'code-diff' || artifact.kind === 'file'));
      const checks = await this.code.inspect({ run, item, artifacts });
      return summarize('Code', checks);
    }
    if (item.kind === 'image') {
      if (!this.image) return { passed: false, findings: ['Image review is enabled but no visual review worker is configured.'] };
      const images = run.artifacts.filter(artifact => artifact.runId === run.id && artifact.kind === 'image');
      const checks = await this.image.inspect({ run, item, images });
      return summarize('Image', checks);
    }
    return { passed: true, findings: [] };
  }
}

function summarize(format: string, checks: CheckResult[]) {
  const findings = checks.filter(check => !check.passed).map(check => `${format} review · ${check.name}: ${check.detail}`);
  if (!checks.length) findings.push(`${format} review returned no verifiable checks; human review is required.`);
  return { passed: checks.length > 0 && findings.length === 0, findings };
}
