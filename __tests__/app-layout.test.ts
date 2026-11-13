/**
 * The three layouts, and the one function that decides them.
 *
 * The app used to have a single threshold, so a 1050px window got the same layout as a 1900px
 * one. It has three now: a compact icon rail, a labelled sidebar, and a labelled sidebar with
 * the inspector docked beside the work. The shell, the views and these tests all read the same
 * function, so they cannot each pick their own number.
 */

import { COMPACT_WIDTH, DOCKED_INSPECTOR_WIDTH, layoutFor } from '../src/app/types';

describe('layoutFor', () => {
  it('folds to an icon rail below the compact threshold', () => {
    expect(layoutFor(320)).toBe('compact');
    expect(layoutFor(COMPACT_WIDTH - 1)).toBe('compact');
  });

  it('shows the labelled sidebar from the compact threshold up', () => {
    expect(layoutFor(COMPACT_WIDTH)).toBe('medium');
    expect(layoutFor(DOCKED_INSPECTOR_WIDTH - 1)).toBe('medium');
  });

  it('docks the inspector from the wide threshold up', () => {
    expect(layoutFor(DOCKED_INSPECTOR_WIDTH)).toBe('wide');
    expect(layoutFor(1440)).toBe('wide');
    expect(layoutFor(3200)).toBe('wide');
  });

  it('keeps the thresholds in the order the layout assumes', () => {
    expect(COMPACT_WIDTH).toBeLessThan(DOCKED_INSPECTOR_WIDTH);
  });
});
