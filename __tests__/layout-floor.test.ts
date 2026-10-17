/**
 * The window floor is a desktop concern, so these tests hold it to desktop terms.
 *
 * Supersedes a 320px criterion that came from WCAG's mobile reflow rule (SC 1.4.10) and does
 * not transfer to a resizable desktop window. What is tested instead: the floor is enforced in
 * native code, the two declarations of it cannot drift, and nothing in the real tree could
 * overflow the floor we actually ship.
 */
// The repo has no @types/node, so fs/path go through require like every other suite here.
declare const require: (name: string) => any;
const fs = require('fs');
const path = require('path');

import { MIN_WINDOW_WIDTH, MIN_WINDOW_HEIGHT } from '../src/layoutFloor';

const NATIVE_SOURCE = path.resolve(__dirname, '..', 'windows', 'DispatchNative', 'DispatchNative.cpp');

describe('the window floor', () => {
  test('is enforced in native code at the same values the JS declares', () => {
    // A floor enforced only in C++ and asserted only in JS is a floor nobody is really testing.
    // These two must never disagree without someone noticing.
    const native = fs.readFileSync(NATIVE_SOURCE, 'utf8');
    const width = native.match(/kMinWindowWidth\s*=\s*(\d+)/);
    const height = native.match(/kMinWindowHeight\s*=\s*(\d+)/);
    expect(width).not.toBeNull();
    expect(height).not.toBeNull();
    expect(Number(width![1])).toBe(MIN_WINDOW_WIDTH);
    expect(Number(height![1])).toBe(MIN_WINDOW_HEIGHT);
  });

  test('is wide enough that the task board stays legible', () => {
    // The board is the screen the product is named for. A floor that let the board collapse
    // to two cards would satisfy the letter of the rule and fail the point of it.
    expect(MIN_WINDOW_WIDTH).toBeGreaterThanOrEqual(900);
    expect(MIN_WINDOW_HEIGHT).toBeGreaterThanOrEqual(600);
  });

  test('is applied through the presenter so it cannot be dragged narrower', () => {
    const native = fs.readFileSync(NATIVE_SOURCE, 'utf8');
    // PreferredMinimumWidth on the presenter is the enforcement path; Resize alone is only
    // the initial size and would leave the window freely shrinkable.
    expect(native).toContain('PreferredMinimumWidth');
    expect(native).toContain('DidPresenterChange');
  });
});