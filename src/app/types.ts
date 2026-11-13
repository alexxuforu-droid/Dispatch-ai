import { IconName } from '../DispatchIcon';
import { WorkKind } from '../orchestration/types';

export type Screen = 'home' | 'dashboard' | 'dispatch' | 'design' | 'computerUse' | 'chat' | 'teams' | 'agents' | 'runs' | 'reviews' | 'artifacts' | 'workflows' | 'plugins' | 'board' | 'settings' | 'results' | 'usage';

export type SavedTeam = { id: string; name: string; description: string; agentIds: string[]; playbook?: string };

export type Role = { id: string; label: string; detail: string; glyph: 'plan' | 'build' | 'review' | 'visual'; kinds: WorkKind[] };

/**
 * The three widths the app has.
 *
 * There used to be one threshold, and everything above it got the same desktop layout, so a
 * window at 1050 was as crowded as a window at 1900 was empty. The app now has three:
 *
 * - compact, below COMPACT_WIDTH: the sidebar folds to an icon rail and the run inspector
 *   opens as a panel over the work;
 * - medium, up to DOCKED_INSPECTOR_WIDTH: the sidebar shows its labels and the inspector is
 *   still a panel, because there is not room for both and the work;
 * - wide: the sidebar, the work and the inspector all have their own column.
 *
 * One function answers it, so the shell, the views and the tests cannot each pick their own
 * number.
 */
export const COMPACT_WIDTH = 900;
export const DOCKED_INSPECTOR_WIDTH = 1280;
export type Layout = 'compact' | 'medium' | 'wide';

export function layoutFor(width: number): Layout {
  if (width < COMPACT_WIDTH) return 'compact';
  if (width < DOCKED_INSPECTOR_WIDTH) return 'medium';
  return 'wide';
}

export const pages: { id: Screen; label: string; icon: IconName; group: 'Work' | 'Team' | 'Library' }[] = [
  { id: 'home', label: 'Home', icon: 'dispatch', group: 'Work' },
  { id: 'dashboard', label: 'Dashboard', icon: 'usage', group: 'Work' },
  { id: 'dispatch', label: 'Dispatch', icon: 'dispatch', group: 'Work' },
  { id: 'design', label: 'Design studio', icon: 'spark', group: 'Work' },
  { id: 'computerUse', label: 'Computer use', icon: 'world', group: 'Work' },
  { id: 'chat', label: 'Conversation', icon: 'chat', group: 'Work' },
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

export const pageTitles: Record<Screen, string> = { home: 'Home', dashboard: 'Dashboard', dispatch: 'Dispatch', design: 'Design studio', computerUse: 'Computer use', chat: 'Conversation', teams: 'Teams', agents: 'Agents', runs: 'Runs', reviews: 'Review findings', artifacts: 'Artifacts', workflows: 'Workflows', plugins: 'Capabilities', board: 'Task board', settings: 'Advanced settings', results: 'Results', usage: 'Usage' };
