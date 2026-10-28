import { HumanDecision, recordHumanDecision } from '../../orchestration/humanDecision';
import { PersistentRunEventStore } from '../../persistence/runStore';
import { Run } from '../../orchestration/types';

const store = new PersistentRunEventStore();

/**
 * Records what a person decided about a proposal or an artifact.
 *
 * The engine writes every automatic step to the run's append-only log, but a human apply,
 * reject or undo touched only the in-memory run, so the history could not tell whether a change
 * was written by a reviewer or by the person in front of the screen.
 *
 * A storage failure must never undo the decision the person just made, so it is swallowed here
 * rather than raised over the notice that reports the decision itself.
 */
export function logHumanDecision(run: Run, decision: HumanDecision): void {
  void recordHumanDecision(store, run, decision).catch(() => undefined);
}
