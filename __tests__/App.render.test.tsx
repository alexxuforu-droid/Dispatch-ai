import React, { act } from 'react';
import renderer, { ReactTestRenderer } from 'react-test-renderer';

jest.mock('@react-native-async-storage/async-storage', () => require('./asyncStorageMock').asyncStorageMock);

import { resetAsyncStorageMock, storageFailures } from './asyncStorageMock';

jest.mock('react-native-safe-area-context', () => {
  const ReactActual = require('react');
  const { View } = require('react-native');
  return {
    SafeAreaProvider: ({ children }: { children: React.ReactNode }) => ReactActual.createElement(View, null, children),
    SafeAreaView: ({ children }: { children: React.ReactNode }) => ReactActual.createElement(View, null, children),
    useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }),
  };
});

const App = require('../App').default;

// Mounting the whole App costs several seconds. Without this, running a single test out of
// this file with -t would trip the 5s default and report a spurious failure.
jest.setTimeout(60000);

async function mount(element?: React.ReactElement): Promise<ReactTestRenderer> {
  let tree!: ReactTestRenderer;
  await act(async () => {
    tree = renderer.create(element ?? React.createElement(App));
  });
  return tree;
}

async function unmount(tree: ReactTestRenderer): Promise<void> {
  await act(async () => {
    tree.unmount();
  });
}

test('App mounts the dispatch screen headlessly', async () => {
  const tree = await mount();
  expect(tree.toJSON()).toBeTruthy();
  await unmount(tree);
});

type TreeNode = { type: string; props: Record<string, unknown>; children?: (string | TreeNode)[] | string | null };
type TreeRoot = TreeNode | string | null | TreeNode[];

function textNodes(tree: TreeRoot): string[] {
  if (!tree) return [];
  if (typeof tree === 'string') return [tree];
  if (Array.isArray(tree)) return tree.flatMap(textNodes);
  const kids = tree.children;
  const own = typeof kids === 'string' ? [kids] : Array.isArray(kids) ? kids.filter((kid): kid is string => typeof kid === 'string') : [];
  // A screen reader hears accessibilityLabel too, so a figure smuggled into one would be
  // just as visible to a user. Walk props as well as children.
  const label = typeof tree.props?.accessibilityLabel === 'string' ? [tree.props.accessibilityLabel] : [];
  const nested = Array.isArray(kids) ? kids.filter((kid): kid is TreeNode => typeof kid === 'object' && kid !== null).flatMap(textNodes) : [];
  return [...own, ...label, ...nested];
}

// AC4. The single most dangerous failure on this screen is quietly summing exact and
// estimated into one number. Assert against the rendered text, not the helper.
test('the usage screen shows two totals and never a combined one', async () => {
  const { recordUsage, clearUsage } = require('../src/persistence/usageLedger');
  await clearUsage();
  const seed = [
    { runId: 'run-1', agentId: 'builder', model: 'gpt-4o', total: 1000, basis: 'exact' as const },
    { runId: 'run-1', agentId: 'reviewer', model: 'local/llama', total: 45678, basis: 'estimated' as const },
  ];
  for (const row of seed) {
    await recordUsage({
      runId: row.runId,
      agentId: row.agentId,
      model: row.model,
      promptTokens: Math.round(row.total / 2),
      completionTokens: row.total - Math.round(row.total / 2),
      totalTokens: row.total,
      basis: row.basis,
      phase: 'run',
    });
  }
  const tree = await mount(React.createElement(App, { initialScreen: 'usage' }));
  const rendered = textNodes(tree.toJSON()).join(' \n ');

  expect(rendered).toContain('1,000');                 // exact total, verbatim
  expect(rendered).toContain('≈ 46,000 (est.)');       // estimate rounded to two significant digits
  // Neither the true sum nor a rounded sum of the two bases may appear anywhere, in any node.
  const exactTotal = 1000;
  const estimatedTotal = 45678;
  const combined = exactTotal + estimatedTotal;
  // React renders the raw number; a formatted surface would render the grouped form.
  // Both are forbidden, in any node, at any precision.
  expect(rendered).not.toContain(String(combined));
  expect(rendered).not.toContain(combined.toLocaleString('en-US'));
  expect(rendered).not.toContain('47,000');
  expect(rendered).not.toContain('47000');
  // The image-exclusion claim the screen makes must actually be on the screen.
  expect(rendered).toContain('Image generation calls are not counted');
  await unmount(tree);
});

// The failure branch of the usage screen is unreachable unless a read is made to fail, and an
// unreachable branch is a branch nobody has ever looked at. These drive it through the real
// readUsage path rather than by injecting props.
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

async function press(tree: ReactTestRenderer, label: string): Promise<void> {
  const node = findByLabel(tree.toJSON(), label);
  if (!node) throw new Error(`no node labelled "${label}" is rendered`);
  const handler = node.props.onClick ?? node.props.onPress ?? node.props.onResponderRelease;
  if (typeof handler !== 'function') throw new Error(`node "${label}" exposes no press handler`);
  await act(async () => { handler(); });
}

afterEach(() => { resetAsyncStorageMock(); });

test('an unreadable ledger reports that it could not be read instead of claiming zero usage', async () => {
  storageFailures.get = true;
  const tree = await mount(React.createElement(App, { initialScreen: 'usage' }));
  const rendered = textNodes(tree.toJSON()).join(' \n ');

  expect(rendered).toContain('Usage history could not be read');
  expect(rendered).toContain('Discard local usage history');
  // The dangerous failure: totals over data the app never loaded. A confident zero here would
  // be indistinguishable from a genuinely unused account.
  expect(rendered).not.toContain('Exact total');
  expect(rendered).not.toContain('Estimated total');
  await unmount(tree);
});

test('a discard that cannot be confirmed is reported as a failure, never as a success', async () => {
  const { clearUsage } = require('../src/persistence/usageLedger');
  storageFailures.get = true;
  const tree = await mount(React.createElement(App, { initialScreen: 'usage' }));

  await press(tree, 'Discard local usage history');
  const rendered = textNodes(tree.toJSON()).join(' \n ');

  expect(rendered).toContain('could not be discarded');
  expect(rendered).toContain('Nothing was changed');
  // Still the failure screen: an unconfirmed clear must not flip the UI to a happy empty state.
  expect(rendered).toContain('Usage history could not be read');
  await unmount(tree);
  storageFailures.get = false;
  await clearUsage();
});

test('a confirmed discard clears the ledger and returns the screen to its empty state', async () => {
  const { clearUsage, recordUsage } = require('../src/persistence/usageLedger');
  await clearUsage();
  await recordUsage({
    runId: 'r', agentId: 'builder', model: 'gpt-4o',
    promptTokens: 10, completionTokens: 10, totalTokens: 20,
    basis: 'exact', phase: 'run',
  });
  storageFailures.get = true;
  const tree = await mount(React.createElement(App, { initialScreen: 'usage' }));
  storageFailures.get = false;

  await press(tree, 'Discard local usage history');
  const rendered = textNodes(tree.toJSON()).join(' \n ');

  expect(rendered).not.toContain('could not be discarded');
  // Empty is now a truthful statement: the store confirmed zero rows.
  expect(rendered).toContain('Exact total');
  expect(rendered).toContain('0');
  await unmount(tree);
});