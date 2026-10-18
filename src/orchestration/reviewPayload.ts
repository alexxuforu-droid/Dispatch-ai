/**
 * The review payload, built so that what the reviewer is shown and what apply will write are
 * provably the same set.
 *
 * The bug this exists to close: `changeDetails` was assembled and then `.slice(0, 30000)`, while
 * the change list feeding `applyProjectFile` was not bounded at all (tool-staged writes merged in
 * with `new Map([...])` and no slice). Each file block is ~12,036 chars, so the reviewer saw the
 * first three files and auto-apply wrote every one of them. Stage four files, keep three
 * innocuous, and the fourth reaches disk unreviewed.
 *
 * Two properties matter, and they are different:
 *  - COMPLETE: every file the reviewer was shown is also a file apply will write. Enforced by
 *    refusing auto-apply on an incomplete payload, because the reviewer cannot honestly pass on
 *    material it never received.
 *  - BALANCED: one enormous file cannot starve the others out of the budget. The per-file budget
 *    is the total divided by the file count, so a proposal is either wholly reviewable or
 *    visibly truncated rather than silently partial.
 */

export const REVIEW_PAYLOAD_BUDGET = 30000;
const OVERHEAD_PER_FILE = 64; // "File: <path>\n\nBEFORE:\n ... \n\n---\n\n"
const MAX_BYTES_PER_FILE = 12000;

export type ReviewableChange = { path: string; before: string; after: string };

export type ReviewPayload = {
  /** What the reviewer is actually shown. */
  text: string;
  /** Paths present in `text`, in order. */
  included: string[];
  /** Paths that did not fit. Empty on a complete payload. */
  omitted: string[];
  /** True when every proposed change appears in `text`. */
  complete: boolean;
};

export function buildReviewPayload(changes: ReviewableChange[], budget = REVIEW_PAYLOAD_BUDGET): ReviewPayload {
  if (!changes.length) return { text: '', included: [], omitted: [], complete: true };

  const perFile = Math.min(MAX_BYTES_PER_FILE, Math.max(1, Math.floor((budget - changes.length * OVERHEAD_PER_FILE) / changes.length)));
  const included: string[] = [];
  const omitted: string[] = [];
  const blocks: string[] = [];

  changes.forEach(change => {
    const before = clip(change.before, perFile);
    const after = clip(change.after, perFile);
    const block = `File: ${change.path}\n\nBEFORE:\n${before}\n\nAFTER:\n${after}`;
    if (blocks.join('\n\n---\n\n').length + block.length + 4 > budget && blocks.length) {
      omitted.push(change.path);
      return;
    }
    blocks.push(block);
    included.push(change.path);
  });

  return {
    text: blocks.join('\n\n---\n\n'),
    included,
    omitted,
    complete: omitted.length === 0,
  };
}

/** Clips with a visible marker so the reviewer never mistakes a truncation for the whole file. */
function clip(text: string, limit: number): string {
  if (text.length <= limit) return text;
  return `${text.slice(0, limit)}\n… truncated for review; ${text.length} characters total …`;
}