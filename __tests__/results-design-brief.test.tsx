/**
 * The design brief carries the constraint the deliverable choice implies.
 *
 * The studio asks for an outcome, a set of changes and a set of things to keep, and the
 * person picks what comes back. A name on its own does not say what has to come back, so
 * the brief states the constraint in words, and the brief is what the agents actually read.
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

async function mountStudio(width: number): Promise<{ tree: ReactTestRenderer; onSendBrief: jest.Mock }> {
  const onSendBrief = jest.fn();
  let tree!: ReactTestRenderer;
  await act(async () => {
    tree = renderer.create(React.createElement(DesignStudio, {
      roles: [{ id: 'builder', label: 'Builder' }],
      activeTeamName: 'Dispatch',
      runHistory: [],
      latestRun: null,
      onSendBrief,
      onError: jest.fn(),
      width,
    }));
  });
  return { tree, onSendBrief };
}

async function unmount(tree: ReactTestRenderer): Promise<void> {
  await act(async () => { tree.unmount(); });
}

test('the brief states the constraint the chosen deliverable puts on the run', async () => {
  const { tree, onSendBrief } = await mountStudio(1400);

  // The person can read the constraint on the screen before they send anything.
  expect(subtreeText(tree.toJSON())).toContain('Deliverable constraint:');

  const send = controlsMatching(tree.toJSON(), /send complete brief to dispatch/i)[0];
  if (!send) throw new Error('the studio offers no way to send the brief');
  await pressControl(send);

  expect(onSendBrief).toHaveBeenCalledTimes(1);
  const brief = (onSendBrief.mock.calls[0][0] as { brief: string }).brief;
  expect(brief).toContain('Deliverable constraint:');
  expect(brief).toMatch(/image artifact/i);
  await unmount(tree);
});

test('choosing code as the deliverable changes the constraint the brief carries', async () => {
  const { tree, onSendBrief } = await mountStudio(1400);

  const codeChoice = controlsMatching(tree.toJSON(), /^ui \/ code$/i)[0];
  if (!codeChoice) throw new Error('the studio offers no code deliverable');
  await pressControl(codeChoice);

  const send = controlsMatching(tree.toJSON(), /send complete brief to dispatch/i)[0];
  if (!send) throw new Error('the studio offers no way to send the brief');
  await pressControl(send);

  const brief = (onSendBrief.mock.calls[0][0] as { brief: string }).brief;
  expect(brief).toContain('Deliverable constraint:');
  expect(brief).toMatch(/code artifact/i);
  expect(brief).not.toMatch(/image artifact/i);
  await unmount(tree);
});

test('the studio still renders at the width the app treats as narrow', async () => {
  const { tree } = await mountStudio(900);
  expect(subtreeText(tree.toJSON())).toContain('Design workspace');
  expect(subtreeText(tree.toJSON())).toContain('Deliverable constraint:');
  await unmount(tree);
});
