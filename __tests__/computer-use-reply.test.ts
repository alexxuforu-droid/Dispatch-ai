/**
 * Contract for the computer-use reply parser.
 *
 * The vision model answers with one JSON object - a summary plus at most one action - and the
 * parser is the only gate between those words and the mouse/keyboard (see liveCaptureLoop).
 * Anything malformed, off-window or over a limit must come back as `invalid` with a reason,
 * never as a half-parsed action that still reaches the screen.
 */

import { parseComputerUseReply } from '../src/orchestration/computerUseReply';

const screen = { width: 1920, height: 1080 };
const reply = (value: unknown) => JSON.stringify(value);

describe('parseComputerUseReply', () => {
  test('a summary with no action is done, and each supported action round-trips unchanged', () => {
    expect(parseComputerUseReply(reply({ summary: 'all done' }), screen))
      .toEqual({ kind: 'done', summary: 'all done' });

    const click = { type: 'click', x: 10, y: 20 };
    expect(parseComputerUseReply(reply({ summary: 'clicking the button', action: click }), screen))
      .toEqual({ kind: 'action', summary: 'clicking the button', action: click });

    const type = { type: 'type', text: 'hello there' };
    expect(parseComputerUseReply(reply({ summary: 'typing', action: type }), screen))
      .toEqual({ kind: 'action', summary: 'typing', action: type });

    const press = { type: 'press', key: 'Enter' };
    expect(parseComputerUseReply(reply({ summary: 'confirming', action: press }), screen))
      .toEqual({ kind: 'action', summary: 'confirming', action: press });

    const scroll = { type: 'scroll', x: 100, y: 200, delta: -300 };
    expect(parseComputerUseReply(reply({ summary: 'scrolling down', action: scroll }), screen))
      .toEqual({ kind: 'action', summary: 'scrolling down', action: scroll });
  });

  test('malformed envelopes, extra keys, and unknown or repeated actions are invalid with a reason', () => {
    const rejected = [
      'not json at all',
      '{"summary":"oops",}',
      '[{"summary":"wrapped in an array"}]',
      '"a bare string"',
      '42',
      reply({ action: { type: 'click', x: 1, y: 1 } }),
      reply({ summary: 42 }),
      reply({ summary: 'ok', note: 'hi' }),
      reply({ summary: 'ok', action: 'click' }),
      reply({ summary: 'ok', action: [{ type: 'click', x: 1, y: 1 }] }),
      reply({ summary: 'ok', actions: [{ type: 'press', key: 'Enter' }] }),
      reply({ summary: 'ok', action: { type: 'wiggle', x: 1, y: 1 } }),
      reply({ summary: 'ok', action: { type: 'click', x: 1 } }),
      reply({ summary: 'ok', action: { type: 'click', x: 1, y: 1, button: 'left' } }),
      reply({ summary: 'ok', action: { type: 'press' } }),
      reply({ summary: 'ok', action: { type: 'scroll', x: 1, y: 1 } }),
    ];
    for (const output of rejected) {
      expect(parseComputerUseReply(output, screen)).toEqual({ kind: 'invalid', reason: expect.stringMatching(/.+/) });
    }
  });

  test('click and scroll coordinates must be integers inside the window', () => {
    const clickAt = (x: unknown, y: unknown) => reply({ summary: 'c', action: { type: 'click', x, y } });
    const scrollAt = (x: unknown, y: unknown) => reply({ summary: 's', action: { type: 'scroll', x, y, delta: 1 } });

    expect(parseComputerUseReply(clickAt(0, 0), screen).kind).toBe('action');
    expect(parseComputerUseReply(clickAt(1919, 1079), screen).kind).toBe('action');

    const outside = [[1920, 0], [0, 1080], [-1, 0], [0, -1], [1.5, 0], [0, 2.5], ['10', 0], [0, null]];
    for (const [x, y] of outside) {
      expect(parseComputerUseReply(clickAt(x, y), screen).kind).toBe('invalid');
      expect(parseComputerUseReply(scrollAt(x, y), screen).kind).toBe('invalid');
    }

    const empty = { width: 0, height: 0 };
    expect(parseComputerUseReply(clickAt(0, 0), empty).kind).toBe('invalid');
    expect(parseComputerUseReply(scrollAt(0, 0), empty).kind).toBe('invalid');
    expect(parseComputerUseReply(clickAt(0, 0), { width: -1, height: 10 }).kind).toBe('invalid');
    expect(parseComputerUseReply(reply({ summary: 'done' }), empty)).toEqual({ kind: 'done', summary: 'done' });
  });

  test('type text is a nonempty string of at most 500 characters', () => {
    const typeText = (text: unknown) => reply({ summary: 't', action: { type: 'type', text } });
    expect(parseComputerUseReply(typeText('hello'), screen).kind).toBe('action');
    expect(parseComputerUseReply(typeText('x'.repeat(500)), screen).kind).toBe('action');
    expect(parseComputerUseReply(typeText(''), screen).kind).toBe('invalid');
    expect(parseComputerUseReply(typeText('x'.repeat(501)), screen).kind).toBe('invalid');
    expect(parseComputerUseReply(typeText(42), screen).kind).toBe('invalid');
  });

  test('press accepts only allowlisted keys, and scroll delta is an integer within [-2000, 2000]', () => {
    const pressKey = (key: unknown) => reply({ summary: 'p', action: { type: 'press', key } });
    const allowedKeys = ['Enter', 'Escape', 'Tab', 'Space', 'Backspace', 'Delete', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'];
    for (const key of allowedKeys) {
      expect(parseComputerUseReply(pressKey(key), screen).kind).toBe('action');
    }
    for (const key of ['enter', 'a', 'F5', '', 'ArrowUpLeft']) {
      expect(parseComputerUseReply(pressKey(key), screen).kind).toBe('invalid');
    }

    const scrollDelta = (delta: unknown) => reply({ summary: 's', action: { type: 'scroll', x: 0, y: 0, delta } });
    expect(parseComputerUseReply(scrollDelta(0), screen).kind).toBe('action');
    expect(parseComputerUseReply(scrollDelta(2000), screen).kind).toBe('action');
    expect(parseComputerUseReply(scrollDelta(-2000), screen).kind).toBe('action');
    for (const delta of [2001, -2001, 0.5, '300']) {
      expect(parseComputerUseReply(scrollDelta(delta), screen).kind).toBe('invalid');
    }
  });
});
