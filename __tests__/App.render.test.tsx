import React, { act } from 'react';
import renderer, { ReactTestRenderer } from 'react-test-renderer';

jest.mock('@react-native-async-storage/async-storage', () => {
  const store = new Map<string, string>();
  return {
    __esModule: true,
    default: {
      getItem: async (key: string) => (store.has(key) ? store.get(key)! : null),
      setItem: async (key: string, value: string) => { store.set(key, value); },
      removeItem: async (key: string) => { store.delete(key); },
      clear: async () => { store.clear(); },
      getAllKeys: async () => [...store.keys()],
    },
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

const App = require('../App').default;

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