import { EventStore } from './event-store';
import { Run } from './types';

/** What a human decided about one proposed change. */
export type HumanDecisionAction = 'apply' | 'reject' | 'undo';

export type HumanDecision = {
  action: HumanDecisionAction;
  /** The code change the decision was about. */
  changeId: string;
  /** The file it applies to, for the log. */
  path?: string;
  /** Who decided. */
  by?: string;
};

/**
 * Records a human decision (apply, reject, undo) in the run's append-only log.
 *
 * The engine writes every automatic step to the log, but a human apply/reject/undo used to
 * touch only the in-memory run, so the history could not tell whether a change was applied by a
 * reviewer or by the person in front of the screen. This helper closes that gap.
 *
 * Intended call sites (the UI is not part of the engine, so it is not called from here yet):
 *  - App.tsx `applyCodeChange`, right after the change is stamped `appliedAt`;
 *  - App.tsx `rejectCodeChange`, right after the change is stamped `rejectedAt`;
 *  - App.tsx `undoCodeChange`, right after the change is stamped `revertedAt`;
 *  - the apply/reject buttons in src/RunWorkspace.tsx, which edit a saved run from the run room.
 *
 * Pass the same event store the run's own events go to (PersistentRunEventStore for a saved run).
 * The call returns a promise: a storage failure must not undo the user's decision, so catch it
 * and tell the user the history could not be updated.
 */
export async function recordHumanDecision(store: EventStore, run: Run, decision: HumanDecision): Promise<void> {
  const at = new Date().toISOString();
  await store.append({ runId: run.id, type: 'human.decision', payload: { ...decision, at }, at });
}
