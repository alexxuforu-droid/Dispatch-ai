/**
 * Headless regression suite for the pure line-diff helper.
 * Pure TypeScript, no native modules, no provider, fully deterministic.
 */

import { DiffLine, MAX_VIEW_LINES, diffLines } from '../src/orchestration/diffLines';

function shaped(diff: { lines: DiffLine[] }): string[] {
  return diff.lines.map(line => `${line.kind}:${line.text}`);
}

describe('diffLines', () => {
  it('flags identical content with no rendered lines', () => {
    const same = 'alpha\nbeta\ngamma';
    expect(diffLines(same, same)).toEqual({ identical: true, added: 0, removed: 0, truncated: false, lines: [] });
    expect(diffLines('', '')).toEqual({ identical: true, added: 0, removed: 0, truncated: false, lines: [] });
  });

  it('treats a trailing-newline-only difference as identical', () => {
    const result = diffLines('alpha\n', 'alpha');
    expect(result).toEqual({ identical: true, added: 0, removed: 0, truncated: false, lines: [] });
  });

  it('still shows a genuine blank-line removal at the end', () => {
    const result = diffLines('alpha\n\n', 'alpha\n');
    expect(result).toMatchObject({ identical: false, added: 0, removed: 1, truncated: false });
    expect(shaped(result)).toEqual(['context:alpha', 'remove:']);
  });

  it('renders a single-line replacement with clamped context', () => {
    const result = diffLines('header\none\ntwo\nthree\nfooter', 'header\none\nTWO\nthree\nfooter');
    expect(result).toEqual({
      identical: false,
      added: 1,
      removed: 1,
      truncated: false,
      lines: [
        { kind: 'context', text: 'header' },
        { kind: 'context', text: 'one' },
        { kind: 'remove', text: 'two' },
        { kind: 'add', text: 'TWO' },
        { kind: 'context', text: 'three' },
        { kind: 'context', text: 'footer' },
      ],
    });
  });

  it('renders a multi-line block replacement with exact add/remove counts', () => {
    const result = diffLines('a\nb\nc\nd', 'a\nX\nY\nd');
    expect(shaped(result)).toEqual(['context:a', 'remove:b', 'remove:c', 'add:X', 'add:Y', 'context:d']);
    expect(result.added).toBe(2);
    expect(result.removed).toBe(2);
    expect(result.truncated).toBe(false);
  });

  it('marks every line as an addition when before is empty (new file)', () => {
    const result = diffLines('', 'one\ntwo\nthree');
    expect(shaped(result)).toEqual(['add:one', 'add:two', 'add:three']);
    expect(result).toMatchObject({ added: 3, removed: 0, identical: false, truncated: false });
  });

  it('marks every line as a removal when after is empty', () => {
    const result = diffLines('one\ntwo', '');
    expect(shaped(result)).toEqual(['remove:one', 'remove:two']);
    expect(result).toMatchObject({ added: 0, removed: 2, identical: false, truncated: false });
  });

  it('truncates long unchanged gaps between distant changes', () => {
    const base = Array.from({ length: 300 }, (_, index) => `line ${index}`);
    const edited = [...base];
    edited[5] = 'CHANGED 5';
    edited[295] = 'CHANGED 295';

    const result = diffLines(base.join('\n'), edited.join('\n'));
    expect(result).toMatchObject({ added: 2, removed: 2, truncated: true });
    expect(result.lines.length).toBeLessThan(30);
    expect(result.lines.some(line => line.kind === 'meta')).toBe(true);
    expect(shaped(result)).toContain('remove:line 5');
    expect(shaped(result)).toContain('add:CHANGED 5');
    expect(shaped(result)).toContain('remove:line 295');
    expect(shaped(result)).toContain('add:CHANGED 295');
  });

  it('caps the rendered view for a huge new file but keeps exact counts', () => {
    const result = diffLines('', Array.from({ length: 5000 }, (_, index) => `line ${index}`).join('\n'));
    expect(result).toMatchObject({ added: 5000, removed: 0, identical: false, truncated: true });
    expect(result.lines.length).toBe(MAX_VIEW_LINES);
    expect(result.lines[0]).toEqual({ kind: 'add', text: 'line 0' });
    expect(result.lines.at(-1)?.kind).toBe('meta');
    expect(result.lines.slice(0, -1).every(line => line.kind === 'add')).toBe(true);
  });

  it('degrades to one remove-block plus one add-block past the DP cap', () => {
    const oldLines = Array.from({ length: 2000 }, (_, index) => `old ${index}`);
    const newLines = Array.from({ length: 2000 }, (_, index) => `new ${index}`);
    const result = diffLines(oldLines.join('\n'), newLines.join('\n'));
    expect(result).toMatchObject({ added: 2000, removed: 2000, truncated: true });
    expect(result.lines.length).toBe(MAX_VIEW_LINES);
    expect(result.lines[0]).toEqual({ kind: 'remove', text: 'old 0' });
    const rendered = result.lines.slice(0, -1);
    expect(rendered.every(line => line.kind === 'remove')).toBe(true);
    expect(result.lines.at(-1)?.kind).toBe('meta');
  });

  it('keeps context lines unprefixed by design markers', () => {
    const result = diffLines('keep\ndrop', 'keep\nkeep-again');
    expect(result.lines.filter(line => line.kind === 'context').map(line => line.text)).toEqual(['keep']);
  });
});
