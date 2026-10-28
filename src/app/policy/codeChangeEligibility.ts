import { codeApplySecretBlock } from '../../orchestration/review';
import { CodeChange, WorkItem } from '../../orchestration/types';

/** Why a proposed change may or may not be written to the project. */
export type ChangeEligibilityReason =
  | 'eligible'
  | 'no-project'
  | 'secret'
  | 'applied'
  | 'superseded'
  | 'rejected'
  | 'reverted'
  | 'not-ready';

export type ChangeEligibility = {
  /** Whether this change may be written to the project right now. */
  eligible: boolean;
  reason: ChangeEligibilityReason;
  /** The sentence the control shows, so the visible text and the accessible name agree. */
  label: string;
  /** The refusal the static secret scan returns, when it refuses. */
  secretBlock: string | null;
};

/**
 * The one rule for "may this change be written?".
 *
 * The predicate used to live in three places with three slightly different answers: the apply
 * handler, the proposal card, and the engine's own review path. A control that looked available
 * while the handler refused was the result, so the answer now comes from one function and both
 * surfaces read it.
 *
 * The label taxonomy moved here with it: one sentence per state, used for the visible text and
 * the accessible name alike.
 */
export function codeChangeEligibility(
  change: CodeChange,
  item: Pick<WorkItem, 'status'> | undefined,
  projectRoot: string,
  options?: { skipStatusCheck?: boolean },
): ChangeEligibility {
  const secretBlock = codeApplySecretBlock(change);
  const status = item?.status;
  const label = !projectRoot ? 'Choose a project folder first'
    : status === 'needs-approval' ? 'Review findings and apply anyway'
    : status === 'done' ? 'Apply proposal'
    : status === 'cancelled' ? 'Run was cancelled'
    : status === 'blocked' ? 'Waiting for its dependencies'
    : status === 'failed' ? 'This step failed'
    : 'Waiting for review';
  const reason: ChangeEligibilityReason = !projectRoot ? 'no-project'
    : secretBlock ? 'secret'
    : change.appliedAt ? 'applied'
    : change.supersededAt ? 'superseded'
    : change.rejectedAt ? 'rejected'
    : change.revertedAt ? 'reverted'
    : (!item || (!options?.skipStatusCheck && (status !== 'done' && status !== 'needs-approval'))) ? 'not-ready'
    : 'eligible';
  return { eligible: reason === 'eligible', reason, label, secretBlock };
}
