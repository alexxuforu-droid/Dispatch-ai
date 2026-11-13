/**
 * The copy control, proved through the rendered UI and the module under it.
 *
 * Three promises:
 *   - the clipboard module is asked for by name and its text is written;
 *   - a runtime without a clipboard degrades to a failure, not a crash;
 *   - the button says what it copied, in words, and tells a screen reader.
 */
import React, { act } from 'react';
import renderer, { ReactTestRenderer } from 'react-test-renderer';

// The clipboard module is reached through the TurboModule registry. It is replaced here so
// the test can decide what the platform offers: a module that works, or none at all.
const mockClipboardGet = jest.fn();
jest.mock('react-native', () => {
  const actual = jest.requireActual('react-native');
  return new Proxy(actual, {
    get: (target, prop) => (prop === 'TurboModuleRegistry' ? { get: mockClipboardGet } : target[prop]),
  });
});

import { AccessibilityInfo } from 'react-native';
import { CopyButton } from '../src/ui';

type TreeNode = { type: string; props: Record<string, unknown>; children?: (string | TreeNode)[] | string | null };
type TreeRoot = TreeNode | string | null | TreeNode[];

function subtreeText(node: TreeRoot): string {
  if (!node) return '';
  if (typeof node === 'string') return node;
  if (Array.isArray(node)) return node.map(subtreeText).join(' ');
  const kids = node.children;
  const own = typeof kids === 'string' ? kids : Array.isArray(kids) ? kids.filter((kid): kid is string => typeof kid === 'string').join('') : '';
  const nested = Array.isArray(kids) ? kids.filter((kid): kid is TreeNode => typeof kid === 'object' && kid !== null).map(subtreeText).join(' ') : '';
  return [own, nested].filter(Boolean).join(' ');
}

function findByLabel(node: TreeRoot, label: string): TreeNode | null {
  if (!node || typeof node === 'string') return null;
  if (Array.isArray(node)) {
    for (const kid of node) {
      const hit = findByLabel(kid, label);
      if (hit) return hit;
    }
    return null;
  }
  if (node.props?.accessibilityLabel === label) return node;
  return findByLabel((node.children ?? null) as TreeRoot, label);
}

async function mount(element: React.ReactElement): Promise<ReactTestRenderer> {
  let tree!: ReactTestRenderer;
  await act(async () => { tree = renderer.create(element); });
  return tree;
}

async function unmount(tree: ReactTestRenderer): Promise<void> {
  await act(async () => { tree.unmount(); });
}

/** Presses the control carrying this accessible name. */
async function press(tree: ReactTestRenderer, label: string): Promise<void> {
  const node = findByLabel(tree.toJSON(), label);
  if (!node) throw new Error(`no node labelled "${label}" is rendered`);
  const handler = node.props.onClick ?? node.props.onPress ?? node.props.onResponderRelease;
  if (typeof handler !== 'function') throw new Error(`node "${label}" exposes no press handler`);
  await act(async () => { handler(); });
}

beforeEach(() => {
  mockClipboardGet.mockReset();
  (AccessibilityInfo.announceForAccessibility as jest.Mock).mockClear();
});

test('the clipboard is asked for by name and the text is written', async () => {
  const setString = jest.fn();
  mockClipboardGet.mockReturnValue({ setString });

  const { copyText } = require('../src/clipboard');
  expect(copyText('src/app.ts')).toBe(true);
  expect(mockClipboardGet).toHaveBeenCalledWith('Clipboard');
  expect(setString).toHaveBeenCalledWith('src/app.ts');
});

test('a runtime without a clipboard reports the failure instead of throwing', async () => {
  mockClipboardGet.mockReturnValue(null);

  const { copyText } = require('../src/clipboard');
  expect(() => copyText('src/app.ts')).not.toThrow();
  expect(copyText('src/app.ts')).toBe(false);
});

test('the button says what it copied and tells a screen reader', async () => {
  const setString = jest.fn();
  mockClipboardGet.mockReturnValue({ setString });

  const tree = await mount(<CopyButton text="src/app.ts" label="Copy path" subject="the file path" />);

  // Before the press the button carries the words it will use.
  expect(subtreeText(tree.toJSON())).toContain('Copy path');
  expect(findByLabel(tree.toJSON(), 'Copy path')).not.toBeNull();

  await press(tree, 'Copy path');

  // The text went to the clipboard...
  expect(setString).toHaveBeenCalledWith('src/app.ts');
  // ...the button says so in words, not only in colour...
  expect(subtreeText(tree.toJSON())).toContain('Copied');
  // ...and the screen reader is told, because the visible change is not what it reads.
  expect(AccessibilityInfo.announceForAccessibility).toHaveBeenCalledWith('Copied the file path to the clipboard.');

  await unmount(tree);
});

test('a failed copy says so rather than claiming it worked', async () => {
  mockClipboardGet.mockReturnValue(null);

  const tree = await mount(<CopyButton text="src/app.ts" label="Copy path" subject="the file path" />);

  await press(tree, 'Copy path');

  const text = subtreeText(tree.toJSON());
  expect(text).toContain('Copy failed');
  expect(text).not.toContain('Copied');
  expect(AccessibilityInfo.announceForAccessibility).toHaveBeenCalledWith('Copy failed.');

  await unmount(tree);
});
