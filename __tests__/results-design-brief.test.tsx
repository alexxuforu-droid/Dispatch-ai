/**
 * The design studio is a screenshot picker plus a prompt.
 *
 * The brief is exactly what the person typed, and the attached screenshot rides along with
 * it. Nothing is rewritten, expanded or decorated here: what the person wrote is what the
 * agents read.
 */
import React, { act } from 'react';
import renderer, { ReactTestRenderer } from 'react-test-renderer';

import { DesignStudio } from '../src/DesignStudio';

jest.mock('@react-native-async-storage/async-storage', () => require('./asyncStorageMock').asyncStorageMock);

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

function pressableNodes(node: TreeRoot): TreeNode[] {
  if (!node || typeof node === 'string') return [];
  if (Array.isArray(node)) return node.flatMap(pressableNodes);
  const handler = node.props?.onClick ?? node.props?.onPress ?? node.props?.onResponderRelease;
  const own = typeof handler === 'function' ? [node] : [];
  return [...own, ...pressableNodes((node.children ?? null) as TreeRoot)];
}

function controlsMatching(node: TreeRoot, pattern: RegExp): TreeNode[] {
  return pressableNodes(node).filter(control => pattern.test(subtreeText(control)));
}

async function pressControl(control: TreeNode): Promise<void> {
  const handler = control.props.onClick ?? control.props.onPress ?? control.props.onResponderRelease;
  if (typeof handler !== 'function') throw new Error('the control exposes no press handler');
  await act(async () => { handler(); });
}

function textField(node: TreeRoot, label: string): TreeNode | null {
  if (!node || typeof node === 'string') return null;
  if (Array.isArray(node)) { for (const kid of node) { const found = textField(kid, label); if (found) return found; } return null; }
  if (node.type === 'TextInput' && node.props?.accessibilityLabel === label) return node;
  return textField((node.children ?? null) as TreeRoot, label);
}

async function mountStudio(): Promise<{ tree: ReactTestRenderer; onSendBrief: jest.Mock }> {
  const onSendBrief = jest.fn();
  let tree!: ReactTestRenderer;
  await act(async () => {
    tree = renderer.create(React.createElement(DesignStudio, {
      onSendBrief,
      onError: jest.fn(),
    }));
  });
  return { tree, onSendBrief };
}

async function unmount(tree: ReactTestRenderer): Promise<void> {
  await act(async () => { tree.unmount(); });
}

test('the studio is one screenshot picker, one prompt and one way to send', async () => {
  const { tree } = await mountStudio();

  const text = subtreeText(tree.toJSON());
  expect(text).toContain('Design studio');
  expect(text).toContain('Attach screenshot');
  expect(text).toContain('Send to Dispatch');
  // No explanatory furniture: the screen is the three controls and nothing else.
  expect(text).not.toMatch(/describe the outcome|deliverable constraint|starting point|prompt recipes/i);

  expect(textField(tree.toJSON(), 'Describe the change')).not.toBeNull();
  await unmount(tree);
});

test('the brief is exactly what the person typed, with no screenshot yet', async () => {
  const { tree, onSendBrief } = await mountStudio();

  const input = textField(tree.toJSON(), 'Describe the change');
  if (!input) throw new Error('the studio offers no prompt field');
  await act(async () => { (input.props.onChangeText as (text: string) => void)('Make the buttons rounder.'); });

  const send = controlsMatching(tree.toJSON(), /send to dispatch/i)[0];
  if (!send) throw new Error('the studio offers no way to send');
  await pressControl(send);

  expect(onSendBrief).toHaveBeenCalledTimes(1);
  const payload = onSendBrief.mock.calls[0][0] as { brief: string; reference?: unknown; annotations: unknown[] };
  expect(payload.brief).toBe('Make the buttons rounder.');
  expect(payload.reference).toBeUndefined();
  expect(payload.annotations).toEqual([]);
  await unmount(tree);
});

test('sending with nothing typed and no screenshot sends nothing', async () => {
  const { tree, onSendBrief } = await mountStudio();
  const send = controlsMatching(tree.toJSON(), /send to dispatch/i)[0];
  if (!send) throw new Error('the studio offers no way to send');
  await pressControl(send);
  expect(onSendBrief).not.toHaveBeenCalled();
  await unmount(tree);
});
