import { IconName } from '../DispatchIcon';
import { WorkKind } from '../orchestration/types';

export type Screen = 'dispatch' | 'design' | 'teams' | 'agents' | 'runs' | 'reviews' | 'artifacts' | 'workflows' | 'plugins' | 'board' | 'settings' | 'results' | 'usage';

export type SavedTeam = { id: string; name: string; description: string; agentIds: string[]; playbook?: string };

export type Role = { id: string; label: string; detail: string; glyph: 'plan' | 'build' | 'review' | 'visual'; kinds: WorkKind[] };

/**
 * The width at which the app stops being a desktop layout.
 *
 * The sidebar folds away, the inspector moves into a panel and the studio stacks its
 * columns below this width, so it is one number for all of them. It lives here because the
 * views and the composition root both need it, and two copies of a threshold drift.
 */
export const COMPACT_WIDTH = 1040;

export const pages: { id: Screen; label: string; icon: IconName; group: 'Work' | 'Team' | 'Library' }[] = [
  { id: 'dispatch', label: 'Dispatch', icon: 'dispatch', group: 'Work' },
  { id: 'design', label: 'Design studio', icon: 'spark', group: 'Work' },
  { id: 'runs', label: 'Runs', icon: 'runs', group: 'Work' },
  { id: 'results', label: 'Results', icon: 'files', group: 'Work' },
  { id: 'board', label: 'Task board', icon: 'board', group: 'Work' },
  { id: 'teams', label: 'Teams', icon: 'team', group: 'Team' },
  { id: 'agents', label: 'Agents', icon: 'agent', group: 'Team' },
  { id: 'reviews', label: 'Review findings', icon: 'reviews', group: 'Library' },
  { id: 'artifacts', label: 'Artifacts', icon: 'artifacts', group: 'Library' },
  { id: 'usage', label: 'Usage', icon: 'usage', group: 'Library' },
  { id: 'workflows', label: 'Workflows', icon: 'workflow', group: 'Library' },
  { id: 'plugins', label: 'Capabilities', icon: 'plugins', group: 'Library' },
];

export const templates: Role[] = [
  { id: 'planner', label: 'Planner', detail: 'Turns a brief into a sequenced work plan.', glyph: 'plan', kinds: ['plan'] },
  { id: 'builder', label: 'Builder', detail: 'Creates code or image outputs in the workspace.', glyph: 'build', kinds: ['code', 'image'] },
  { id: 'reviewer', label: 'Code reviewer', detail: 'Checks changes, tests, and likely regressions.', glyph: 'review', kinds: ['code', 'review'] },
  { id: 'art-critic', label: 'Visual reviewer', detail: 'Inspects images for composition and defects.', glyph: 'visual', kinds: ['image', 'review'] },
];

export const rankNames = ['Apprentice', 'Associate', 'Specialist', 'Lead', 'Principal'];

export const sentenceCase = (value: string): string => value.charAt(0).toUpperCase() + value.slice(1);

export const pageTitles: Record<Screen, string> = { dispatch: 'Dispatch', design: 'Design studio', teams: 'Teams', agents: 'Agents', runs: 'Runs', reviews: 'Review findings', artifacts: 'Artifacts', workflows: 'Workflows', plugins: 'Capabilities', board: 'Task board', settings: 'Advanced settings', results: 'Results', usage: 'Usage' };
