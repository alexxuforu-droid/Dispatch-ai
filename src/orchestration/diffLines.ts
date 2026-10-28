/** One rendered diff line: changed lines carry add/remove, meta marks truncated spans. */
export type DiffLineKind = 'context' | 'add' | 'remove' | 'meta';
export type DiffLine = { kind: DiffLineKind; text: string; oldLineNumber?: number; newLineNumber?: number };
/** Flat hunk list: context lines clamp each change group; gaps longer than 2*context become meta markers. */
export type DiffResult = { identical: boolean; added: number; removed: number; truncated: boolean; lines: DiffLine[] };

/** Hard cap on rendered diff lines so a change card never dumps a whole file again. */
export const MAX_VIEW_LINES = 400;
/** Unchanged lines kept on each side of a change group. */
export const CONTEXT_LINES = 3;
// ponytail: LCS DP capped at ~2M cells; beyond that the whole changed middle degrades to one remove-block plus one add-block (order and exactness kept, alignment lost). Swap in Myers if interleaved alignment ever matters.
const MAX_DP_CELLS = 2_000_000;

/** Line-level diff of two file contents. Pure: same inputs, same output, no I/O, no dependencies. */
export function diffLines(before: string, after: string): DiffResult {
  const oldLines = splitLines(before);
  const newLines = splitLines(after);

  let head = 0;
  while (head < oldLines.length && head < newLines.length && oldLines[head] === newLines[head]) head += 1;
  let tail = 0;
  while (tail < oldLines.length - head && tail < newLines.length - head
    && oldLines[oldLines.length - 1 - tail] === newLines[newLines.length - 1 - tail]) tail += 1;

  // Each file is numbered on its own axis: a remove advances the old file only, an add the new
  // file only, a context line carries both. Deriving the numbers from one interleaved op index
  // shifts every changed line after the first op, which is the common single-line-edit shape
  // and reads as a wrong line to review.
  const middle = diffMiddle(oldLines.slice(head, oldLines.length - tail), newLines.slice(head, newLines.length - tail), head);
  const ops: DiffLine[] = [
    ...oldLines.slice(0, head).slice(-CONTEXT_LINES).map((text, index, visible) => context(text, head - visible.length + index + 1, head - visible.length + index + 1)),
    ...middle,
    ...oldLines.slice(oldLines.length - tail).slice(0, CONTEXT_LINES).map((text, index) => context(text, oldLines.length - tail + index + 1, newLines.length - tail + index + 1)),
  ];

  let added = 0;
  let removed = 0;
  ops.forEach(op => {
    if (op.kind === 'add') added += 1;
    if (op.kind === 'remove') removed += 1;
  });
  if (added === 0 && removed === 0) return { identical: true, added: 0, removed: 0, truncated: false, lines: [] };

  const view = buildView(ops);
  return { identical: false, added, removed, truncated: view.truncated, lines: view.lines };
}

/**
 * Splits into lines for comparison, ignoring line endings.
 *
 * A Windows file and its LF twin are the same file to a reviewer: without this, every line
 * differed and the whole file showed as changed. The endings are normalised for the comparison
 * only -- the content that gets written to disk is untouched.
 */
function splitLines(text: string): string[] {
  const normalized = text.replace(/\r\n/g, '\n').replace(/\r/g, '\n');
  // Drops at most one final newline so a trailing-newline-only difference is not a change;
  // blank-line edits still diff.
  const trimmed = normalized.endsWith('\n') ? normalized.slice(0, -1) : normalized;
  return trimmed === '' ? [] : trimmed.split('\n');
}

function context(text: string, oldLineNumber?: number, newLineNumber?: number): DiffLine {
  return {
    kind: 'context',
    text,
    ...(oldLineNumber === undefined ? {} : { oldLineNumber }),
    ...(newLineNumber === undefined ? {} : { newLineNumber }),
  };
}

function diffMiddle(oldLines: string[], newLines: string[], offset: number): DiffLine[] {
  const rows = oldLines.length;
  const columns = newLines.length;
  if ((rows + 1) * (columns + 1) > MAX_DP_CELLS) {
    return [
      ...oldLines.map<DiffLine>((text, index) => ({ kind: 'remove', text, oldLineNumber: offset + index + 1 })),
      ...newLines.map<DiffLine>((text, index) => ({ kind: 'add', text, newLineNumber: offset + index + 1 })),
    ];
  }

  const width = columns + 1;
  const lcs = new Uint32Array((rows + 1) * width);
  for (let row = rows - 1; row >= 0; row -= 1) {
    for (let column = columns - 1; column >= 0; column -= 1) {
      lcs[row * width + column] = oldLines[row] === newLines[column]
        ? lcs[(row + 1) * width + column + 1] + 1
        : Math.max(lcs[(row + 1) * width + column], lcs[row * width + column + 1]);
    }
  }

  const ops: DiffLine[] = [];
  let row = 0;
  let column = 0;
  while (row < rows && column < columns) {
    if (oldLines[row] === newLines[column]) {
      // Each file carries its own position for this line: after an unequal add/remove run the
      // old and new numbers diverge, and a single shared counter would mislabel the rest.
      ops.push(context(oldLines[row], offset + row + 1, offset + column + 1));
      row += 1;
      column += 1;
    } else if (lcs[(row + 1) * width + column] >= lcs[row * width + column + 1]) {
      ops.push({ kind: 'remove', text: oldLines[row], oldLineNumber: offset + row + 1 });
      row += 1;
    } else {
      ops.push({ kind: 'add', text: newLines[column], newLineNumber: offset + column + 1 });
      column += 1;
    }
  }
  while (row < rows) { ops.push({ kind: 'remove', text: oldLines[row], oldLineNumber: offset + row + 1 }); row += 1; }
  while (column < columns) { ops.push({ kind: 'add', text: newLines[column], newLineNumber: offset + column + 1 }); column += 1; }
  return ops;
}

function buildView(ops: DiffLine[]): { lines: DiffLine[]; truncated: boolean } {
  const groups: { start: number; end: number }[] = [];
  ops.forEach((op, index) => {
    if (op.kind === 'context') return;
    const start = Math.max(0, index - CONTEXT_LINES);
    const end = Math.min(ops.length, index + CONTEXT_LINES + 1);
    const last = groups.at(-1);
    if (last && start <= last.end) last.end = Math.max(last.end, end);
    else groups.push({ start, end });
  });

  const lines: DiffLine[] = [];
  let cursor = 0;
  let hidden = 0;
  let announced = 0;
  let capped = false;

  for (const group of groups) {
    const gap = group.start > cursor ? 1 : 0;
    const budget = MAX_VIEW_LINES - lines.length - gap - 1;
    if (budget <= 0) {
      hidden += ops.length - cursor;
      capped = true;
      break;
    }
    if (gap) {
      hidden += group.start - cursor;
      announced += group.start - cursor;
      lines.push({ kind: 'meta', text: `… ${group.start - cursor} unchanged lines hidden …` });
    }
    if (group.end - group.start <= budget) {
      lines.push(...ops.slice(group.start, group.end));
      cursor = group.end;
    } else {
      lines.push(...ops.slice(group.start, group.start + budget));
      hidden += ops.length - (group.start + budget);
      capped = true;
      break;
    }
  }

  if (capped) lines.push({ kind: 'meta', text: `… ${hidden - announced} more lines hidden …` });
  return { lines, truncated: hidden > 0 };
}
