import { WorkItem } from '../../orchestration/types';

/**
 * The result of a plan edit.
 *
 * A refused edit carries the reason it was refused, in words the person can read, and the
 * plan unchanged. Nothing here writes anything: the caller decides whether to keep the
 * new items, so the same rules can be used by a screen and by a test.
 */
export type PlanEditResult =
  | { ok: true; items: WorkItem[] }
  | { ok: false; items: WorkItem[]; reason: string };

/**
 * Reassigns one work item to another agent.
 *
 * The item has to exist, and the agent has to be one this run actually has. A plan that
 * names an agent nobody knows is a plan that cannot be run, so it is refused here rather
 * than saved and discovered later.
 */
export function reassignWorkItem(items: WorkItem[], itemId: string, agentId: string, agentIds: readonly string[]): PlanEditResult {
  if (!items.some(item => item.id === itemId)) {
    return { ok: false, items, reason: 'That work item is not in this plan.' };
  }
  if (!agentId.trim()) {
    return { ok: false, items, reason: 'Choose an agent to own this step.' };
  }
  if (!agentIds.includes(agentId)) {
    return { ok: false, items, reason: 'That agent is not on this run\'s team.' };
  }
  const current = items.find(item => item.id === itemId);
  if (current?.agentId === agentId) {
    return { ok: false, items, reason: 'That step is already owned by that agent.' };
  }
  return { ok: true, items: items.map(item => item.id === itemId ? { ...item, agentId } : item) };
}

/**
 * Adds or removes one dependency edge.
 *
 * A step waits for the steps it depends on, so the graph is read in that direction: adding
 * the edge `item -> dependency` is refused when the dependency already waits, directly or
 * through other steps, for the item. A plan that waits for itself never runs.
 */
export function setDependency(items: WorkItem[], itemId: string, dependsOnId: string, depends: boolean): PlanEditResult {
  if (!items.some(item => item.id === itemId)) {
    return { ok: false, items, reason: 'That work item is not in this plan.' };
  }
  if (!items.some(item => item.id === dependsOnId)) {
    return { ok: false, items, reason: 'That dependency is not in this plan.' };
  }
  if (itemId === dependsOnId) {
    return { ok: false, items, reason: 'A step cannot depend on itself.' };
  }
  const current = items.find(item => item.id === itemId);
  if (!current) return { ok: false, items, reason: 'That work item is not in this plan.' };
  const already = current.dependsOn.includes(dependsOnId);
  if (already === depends) {
    return { ok: false, items, reason: depends ? 'That dependency is already in place.' : 'That dependency is not in place.' };
  }
  if (!depends) {
    return { ok: true, items: items.map(item => item.id === itemId ? { ...item, dependsOn: item.dependsOn.filter(id => id !== dependsOnId) } : item) };
  }
  const next = items.map(item => item.id === itemId ? { ...item, dependsOn: [...item.dependsOn, dependsOnId] } : item);
  const cycle = dependencyPath(next, dependsOnId, itemId);
  if (cycle) {
    return { ok: false, items, reason: `That would make the plan wait on itself: ${cycle.join(' → ')}.` };
  }
  return { ok: true, items: next };
}

/**
 * The path from one step to another, following the "waits for" edges.
 *
 * Returns null when the second step is not reachable, which is what "no cycle" means for
 * the edge being added.
 */
function dependencyPath(items: WorkItem[], fromId: string, targetId: string): string[] | null {
  const byId = new Map(items.map(item => [item.id, item]));
  const seen = new Set<string>();
  const walk = (id: string, path: string[]): string[] | null => {
    if (id === targetId) return [...path, id];
    if (seen.has(id)) return null;
    seen.add(id);
    for (const next of byId.get(id)?.dependsOn ?? []) {
      const found = walk(next, [...path, id]);
      if (found) return found;
    }
    return null;
  };
  return walk(fromId, []);
}
