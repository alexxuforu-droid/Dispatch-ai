import { Artifact, CodeChange, Run } from '../../orchestration/types';
import { isChangePayloadElided } from '../../persistence/runStore';
import { codeChangeEligibility } from '../policy/codeChangeEligibility';
import { ApplyChanges, ApplyFile, RemoveFile } from './types';

export type ApplyCodeChangeContext = {
  run: Run | null;
  changeId: string;
  projectRoot: string;
  /** Whether this change is already being written. */
  applying: boolean;
  applyFile: ApplyFile;
  /** Removes a file, so a change that could not be recorded can be put back. */
  removeFile?: RemoveFile;
  /**
   * Writes every file of one proposal as a unit. A proposal that touches more than one
   * file goes through this, never through the single-file path.
   */
  applyChanges?: ApplyChanges;
  /** Persists the applied state. The change counts as applied only once this resolves. */
  persistSnapshot?: (run: Run) => Promise<void>;
};

export type ApplyCodeChangeResult =
  | { outcome: 'applied'; run: Run; change: CodeChange; message: string }
  | { outcome: 'blocked'; message: string }
  | { outcome: 'skipped' }
  | { outcome: 'failed'; message: string };

/** Why a change cannot be touched at all. */
const ELIDED_PAYLOAD_MESSAGE = 'This change was stored without its file contents because the payload was too large, so it cannot be applied or undone.';

/**
 * Writes a reviewed proposal into the chosen project.
 *
 * The rule for "may this be written?" lives in one place (`codeChangeEligibility`), so the
 * handler and the card cannot disagree about it. The file write is injected, so this path can be
 * driven in a test without a renderer or a native bridge.
 *
 * A work item can propose more than one file. Those files are written as one unit through
 * `applyChanges`, which rolls the whole proposal back if any file fails, and the applied state
 * is only reported once the run snapshot carrying it has been written. The undo therefore
 * exists before the UI can offer one.
 */
export async function applyCodeChange(context: ApplyCodeChangeContext): Promise<ApplyCodeChangeResult> {
  if (!context.run || !context.projectRoot || context.applying) return { outcome: 'skipped' };
  const change = context.run.changes?.find(candidate => candidate.id === context.changeId);
  const item = change && context.run.items.find(candidate => candidate.id === change.itemId);
  if (!change || !item) return { outcome: 'skipped' };
  // A change whose payload was elided when it was stored has no file contents, so writing it
  // would put the placeholder text into the project.
  if (isChangePayloadElided(change)) return { outcome: 'blocked', message: ELIDED_PAYLOAD_MESSAGE };
  const eligibility = codeChangeEligibility(change, item, context.projectRoot);
  if (eligibility.reason === 'secret') return { outcome: 'blocked', message: eligibility.secretBlock ?? '' };
  if (!eligibility.eligible) return { outcome: 'skipped' };
  // Every file this work item proposed, so a multi-file proposal is written as one unit.
  const group = (context.run.changes ?? []).filter(candidate => candidate.itemId === change.itemId && !candidate.appliedAt && !candidate.revertedAt && !candidate.rejectedAt);
  const files = group.map(candidate => ({ path: candidate.path, before: candidate.before, after: candidate.after, createOnly: candidate.createOnly }));
  const appliedAt = new Date().toISOString();
  const updated: Run = {
    ...context.run,
    changes: context.run.changes?.map(candidate => group.some(member => member.id === candidate.id) ? { ...candidate, appliedAt, reviewOverride: item.status === 'needs-approval' } : candidate),
    updatedAt: appliedAt,
  };
  if (files.length > 1 && context.applyChanges) {
    try {
      const result = await context.applyChanges(context.projectRoot, files, async () => { await persist(context, updated); });
      if (!result.ok) {
        const reason = result.failed?.message ?? 'The reviewed project change could not be applied.';
        // A file that could not be restored is still changed on disk, and the person has to
        // know which one, so the message names it rather than saying "could not be applied".
        const stuck = result.written.filter(path => !result.rolledBack.includes(path));
        return { outcome: 'failed', message: stuck.length ? `${reason} These files were changed and could not be put back: ${stuck.join(', ')}.` : `${reason} The files were put back as they were.` };
      }
      return { outcome: 'applied', run: updated, change: { ...change, appliedAt }, message: `Applied ${files.length} files to the selected project.` };
    } catch (error) {
      return { outcome: 'failed', message: error instanceof Error ? error.message : 'The reviewed project change could not be applied.' };
    }
  }
  try {
    await context.applyFile(context.projectRoot, change.path, change.before, change.after, change.createOnly);
  } catch (error) {
    return { outcome: 'failed', message: error instanceof Error ? error.message : 'The reviewed project change could not be applied.' };
  }
  if (context.persistSnapshot) {
    try {
      await context.persistSnapshot(updated);
    } catch (error) {
      // The file is written but the device does not record it, so the file goes back: a change
      // the run does not know about is a change nobody can undo.
      const restored = await restore(context, change);
      const reason = error instanceof Error ? error.message : 'The applied state could not be saved.';
      return { outcome: 'failed', message: restored ? `${reason} ${change.path} was put back as it was.` : `${reason} ${change.path} could not be put back.` };
    }
  }
  return { outcome: 'applied', run: updated, change: { ...change, appliedAt }, message: `Applied ${change.path} to the selected project.` };
}

async function persist(context: ApplyCodeChangeContext, run: Run): Promise<void> {
  if (!context.persistSnapshot) return;
  await context.persistSnapshot(run);
}

/** Puts one written file back the way it was. Returns false when it could not be restored. */
async function restore(context: ApplyCodeChangeContext, change: CodeChange): Promise<boolean> {
  try {
    if (change.createOnly && context.removeFile) await context.removeFile(context.projectRoot, change.path, change.after);
    else await context.applyFile(context.projectRoot, change.path, change.after, change.before, false);
    return true;
  } catch {
    return false;
  }
}

export type UndoCodeChangeContext = {
  run: Run | null;
  changeId: string;
  projectRoot: string;
  applyFile: ApplyFile;
  removeFile: RemoveFile;
};

export type UndoCodeChangeResult =
  | { outcome: 'undone'; run: Run; change: CodeChange; message: string }
  | { outcome: 'skipped' }
  | { outcome: 'failed'; message: string };

/** Puts an applied proposal back the way it was. */
export async function undoCodeChange(context: UndoCodeChangeContext): Promise<UndoCodeChangeResult> {
  if (!context.run || !context.projectRoot) return { outcome: 'skipped' };
  const change = context.run.changes?.find(item => item.id === context.changeId);
  if (!change?.appliedAt || change.revertedAt) return { outcome: 'skipped' };
  // The stored payload is a placeholder, so there is nothing to write back.
  if (isChangePayloadElided(change)) return { outcome: 'failed', message: ELIDED_PAYLOAD_MESSAGE };
  try {
    if (change.createOnly) await context.removeFile(context.projectRoot, change.path, change.after);
    else await context.applyFile(context.projectRoot, change.path, change.after, change.before, false);
    const revertedAt = new Date().toISOString();
    const updated: Run = {
      ...context.run,
      changes: context.run.changes?.map(item => item.id === change.id ? { ...item, revertedAt } : item),
      updatedAt: revertedAt,
    };
    return { outcome: 'undone', run: updated, change: { ...change, revertedAt }, message: `Undid ${change.path}.` };
  } catch (error) {
    return { outcome: 'failed', message: error instanceof Error ? error.message : 'The file changed after this run, so it was left untouched.' };
  }
}

/** Marks a proposal as declined. Returns null when there is nothing to decline. */
export function rejectCodeChange(run: Run, changeId: string): Run | null {
  const change = run.changes?.find(item => item.id === changeId);
  if (!change || change.appliedAt || change.revertedAt || change.supersededAt || change.rejectedAt) return null;
  const rejectedAt = new Date().toISOString();
  return {
    ...run,
    changes: run.changes?.map(item => item.id === changeId ? { ...item, rejectedAt } : item),
    updatedAt: rejectedAt,
  };
}

/** Marks an artifact as accepted. */
export function acceptArtifact(run: Run, artifactId: string): Run {
  return {
    ...run,
    artifacts: run.artifacts.map((item: Artifact) => item.id === artifactId ? { ...item, acceptedAt: new Date().toISOString(), rejectedAt: undefined } : item),
    updatedAt: new Date().toISOString(),
  };
}
