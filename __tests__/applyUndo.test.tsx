/**
 * Apply a code proposal and take it back, through the app, for real.
 *
 * These are the two destructive paths in the product: one writes a file in the person's own
 * project, the other rewrites it. A test that only presses a control with a mock handler
 * would stay green if the write went to the wrong place, or if the undo restored nothing.
 * So the native module is stubbed with a file map, and the file map is the evidence.
 *
 * The native half cannot be reached from jest, so what is proven here is the JavaScript
 * half: the app's own apply and undo handlers, the notice that offers the way back, and
 * the change's own state after each.
 */
import React, { act } from 'react';
import renderer, { ReactTestRenderer } from 'react-test-renderer';

jest.mock('@react-native-async-storage/async-storage', () => require('./asyncStorageMock').asyncStorageMock);

jest.mock('../src/persistence/workspaceProject', () => {
  const actual = jest.requireActual('../src/persistence/workspaceProject');
  const files: Record<string, string> = {};
  const calls: { root: string; path: string; expected: string; replacement: string; createOnly: boolean }[] = [];
  return {
    ...actual,
    // The file map is the evidence, so the test can read it.
    files,
    // The real native module refuses a write whose expected text no longer matches, so the
    // arguments are recorded and checked rather than thrown away.
    calls,
    loadProjectRoot: async () => 'C:\\work',
    applyProjectFile: async (root: string, path: string, expected: string, replacement: string, createOnly: boolean) => { calls.push({ root, path, expected, replacement, createOnly }); files[path] = replacement; return replacement; },
    removeProjectFile: async (root: string, path: string, expected: string) => { calls.push({ root, path, expected, replacement: '', createOnly: false }); delete files[path]; return ''; },
  };
});

jest.mock('react-native-safe-area-context', () => {
  const ReactActual = require('react');
  const { View } = require('react-native');
  return {
    SafeAreaProvider: ({ children }: { children: React.ReactNode }) => ReactActual.createElement(View, null, children),
    SafeAreaView: ({ children }: { children: React.ReactNode }) => ReactActual.createElement(View, null, children),
    useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }),
  };
});

let mockViewport: { width: number; height: number } | null = null;
jest.mock('react-native/Libraries/Utilities/useWindowDimensions', () => {
  const actual = jest.requireActual('react-native/Libraries/Utilities/useWindowDimensions').default;
  return {
    __esModule: true,
    default: () => mockViewport ? { ...(mockViewport as { width: number; height: number }), scale: 1, fontScale: 1 } : actual(),
  };
});

import { resetAsyncStorageMock, storageBacking } from './asyncStorageMock';

const App = require('../App').default;
const { saveRunSnapshot } = require('../src/persistence/runStore') as typeof import('../src/persistence/runStore');
const { files, calls } = require('../src/persistence/workspaceProject') as { files: Record<string, string>; calls: { root: string; path: string; expected: string; replacement: string; createOnly: boolean }[] };

jest.setTimeout(60000);

const PATH = 'src/app/greeting.ts';
const BEFORE = 'export const greeting = "hello";\n';
const AFTER = 'export const greeting = "hello, world";\n';

type TreeNode = { type: string; props: Record<string, unknown>; children?: (string | TreeNode)[] | string | null };
type TreeRoot = TreeNode | string | null | TreeNode[];

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

function textNodes(tree: TreeRoot): string[] {
  if (!tree) return [];
  if (typeof tree === 'string') return [tree];
  if (Array.isArray(tree)) return tree.flatMap(textNodes);
  const kids = tree.children;
  const own = typeof kids === 'string' ? [kids] : Array.isArray(kids) ? kids.filter((kid): kid is string => typeof kid === 'string') : [];
  const label = typeof tree.props?.accessibilityLabel === 'string' ? [tree.props.accessibilityLabel] : [];
  const nested = Array.isArray(kids) ? kids.filter((kid): kid is TreeNode => typeof kid === 'object' && kid !== null).flatMap(textNodes) : [];
  return [...own, ...label, ...nested];
}

async function press(tree: ReactTestRenderer, label: string): Promise<void> {
  const node = findByLabel(tree.toJSON(), label);
  if (!node) throw new Error(`no node labelled "${label}" is rendered`);
  const handler = node.props.onClick ?? node.props.onPress ?? node.props.onResponderRelease;
  if (typeof handler !== 'function') throw new Error(`node "${label}" exposes no press handler`);
  await act(async () => { handler(); });
}

async function mount(element?: React.ReactElement): Promise<ReactTestRenderer> {
  let tree!: ReactTestRenderer;
  await act(async () => { tree = renderer.create(element ?? React.createElement(App)); });
  return tree;
}

async function unmount(tree: ReactTestRenderer): Promise<void> {
  await act(async () => { tree.unmount(); });
}

beforeEach(() => {
  resetAsyncStorageMock();
  for (const key of Object.keys(files)) delete files[key];
  calls.length = 0;
  // The project the proposal writes into.
  storageBacking.set('dispatch.workspace.project.v1', 'C:\\work');
  files[PATH] = BEFORE;
});

test('applying a proposal writes the file, and the undo in the notice puts it back', async () => {
  const now = '2026-01-01T00:00:00.000Z';
  await saveRunSnapshot({
    id: 'run-apply',
    brief: 'Greet the world properly.',
    teamId: 'team-default',
    status: 'completed',
    items: [{ id: 'item-greeting', title: PATH, kind: 'code', agentId: 'builder', dependsOn: [], status: 'done', artifactIds: [] }],
    messages: [],
    artifacts: [],
    changes: [{ id: 'change-greeting', itemId: 'item-greeting', path: PATH, before: BEFORE, after: AFTER, createOnly: false, createdBy: 'builder', attempt: 1 }],
    createdAt: now,
    updatedAt: now,
  });

  const tree = await mount(React.createElement(App, { initialScreen: 'results' }));

  // The proposal is on the screen, waiting.
  expect(textNodes(tree.toJSON()).join(' \n ')).toContain(PATH);
  expect(files[PATH]).toBe(BEFORE);

  await press(tree, 'Apply change');

  // The file in the project now holds the new contents, and it was written to the
  // project that was chosen, with the text the proposal expected to find.
  expect(files[PATH]).toBe(AFTER);
  expect(calls[0]).toEqual({ root: 'C:\\work', path: PATH, expected: BEFORE, replacement: AFTER, createOnly: false });

  // And the notice that reports it offers the way back.
  const undo = findByLabel(tree.toJSON(), 'Undo');
  if (!undo) throw new Error('the notice that reports the applied change does not offer the undo');

  await press(tree, 'Undo');

  // The file is back to what it was, the undo wrote the old text over the new one, and
  // the change says it was reverted.
  expect(files[PATH]).toBe(BEFORE);
  expect(calls[1]).toEqual({ root: 'C:\\work', path: PATH, expected: AFTER, replacement: BEFORE, createOnly: false });
  expect(textNodes(tree.toJSON()).join(' \n ')).toMatch(/revert/i);

  await unmount(tree);
});
