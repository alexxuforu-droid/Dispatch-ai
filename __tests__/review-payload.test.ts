/**
 * Contract for the review payload.
 *
 * The invariant under test is one line: what the reviewer is shown and what auto-apply writes must
 * be the same set of files, in full. The original code truncated the reviewer's view to 30,000 chars while
 * leaving the apply list unbounded, so a proposal of four files showed the first three and wrote
 * all four. Clipping a single huge file was the same defect wearing a different hat: the file was
 * "included", so the payload claimed to be complete while the reviewer had seen part of it.
 */

import { buildReviewPayload } from '../src/orchestration/reviewPayload';

const file = (path: string, size = 1000) => ({ path, before: 'b'.repeat(size), after: 'a'.repeat(size) });

describe('buildReviewPayload', () => {
  it('includes every change when they all fit, and reports completeness', () => {
    const payload = buildReviewPayload([file('a.ts'), file('b.ts')]);
    expect(payload.complete).toBe(true);
    expect(payload.omitted).toEqual([]);
    expect(payload.clipped).toEqual([]);
    expect(payload.included).toEqual(['a.ts', 'b.ts']);
    expect(payload.text).toContain('File: a.ts');
    expect(payload.text).toContain('File: b.ts');
  });

  it('is complete and empty for no changes', () => {
    expect(buildReviewPayload([])).toEqual({ text: '', included: [], omitted: [], clipped: [], complete: true });
  });

  it('reports which files it omitted rather than silently dropping them', () => {
    // 6 files at 10,000 chars each cannot fit the review budget.
    const payload = buildReviewPayload([file('a.ts', 10000), file('b.ts', 10000), file('c.ts', 10000), file('d.ts', 10000), file('e.ts', 10000), file('f.ts', 10000)]);
    expect(payload.complete).toBe(false);
    expect(payload.omitted.length).toBeGreaterThan(0);
    expect(payload.included.length + payload.omitted.length).toBe(6);
    // Never lose track: an included path is one the reviewer can actually see.
    for (const path of payload.included) expect(payload.text).toContain(`File: ${path}`);
  });

  it('never lets one huge file starve every other file out of the budget', () => {
    const payload = buildReviewPayload([file('huge.ts', 500000), file('small.ts', 100)]);
    expect(payload.text).toContain('File: small.ts');
    // The huge file was shown, but only in part: the payload cannot claim to be complete.
    expect(payload.complete).toBe(false);
    expect(payload.clipped).toContain('huge.ts');
    expect(payload.omitted).toEqual([]);
  });

  it('marks a clipped file visibly so the reviewer cannot mistake it for the whole file', () => {
    const payload = buildReviewPayload([file('big.ts', 40000)]);
    expect(payload.text).toContain('truncated for review');
    expect(payload.text).toContain('40000 characters total');
  });

  it('is incomplete when a file was clipped, even though the file was included', () => {
    const payload = buildReviewPayload([file('big.ts', 40000)]);
    expect(payload.included).toEqual(['big.ts']);
    expect(payload.clipped).toEqual(['big.ts']);
    expect(payload.complete).toBe(false);
  });

  it('leaves a small file completely unmarked', () => {
    const payload = buildReviewPayload([file('small.ts', 50)]);
    expect(payload.text).not.toContain('truncated for review');
    expect(payload.clipped).toEqual([]);
    expect(payload.complete).toBe(true);
  });

  it('respects a caller-supplied budget', () => {
    const payload = buildReviewPayload([file('a.ts', 5000), file('b.ts', 5000), file('c.ts', 5000)], 5000);
    expect(payload.text.length).toBeLessThanOrEqual(5000);
    expect(payload.complete).toBe(false);
  });
});
