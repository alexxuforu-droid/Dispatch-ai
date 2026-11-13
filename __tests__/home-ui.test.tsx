/**
 * The home and dashboard screens, the screen shortcuts, and the last-screen persistence.
 *
 * These cover the ui-08 port: the welcome screen's three steps, the dashboard's six stat
 * cards and its honest empty states (nothing is seeded), Ctrl/Cmd+1..9 jumping to the first
 * nine pages, and the app reopening on the screen it was left on.
 */
import React, { act } from 'react';
import renderer, { ReactTestRenderer } from 'react-test-renderer';

jest.mock('@react-native-async-storage/async-storage', () => require('./asyncStorageMock').asyncStorageMock);
jest.mock('../src/NativeCapture', () => ({ __esModule: true, default: null }));

import { resetAsyncStorageMock, storageBacking, storageFailures } from './asyncStorageMock';

jest.mock('react-native-safe-area-context', () => {
  const ReactActual = require('react');
  const { View } = require('react-native');
  return {
    SafeAreaProvider: ({ children }: { children: React.ReactNode }) => ReactActual.createElement(View, null, children),
    SafeAreaView: ({ children }: { children: React.ReactNode }) => ReactActual.createElement(View, null, children),
    useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }),
  };
});

jest.mock('react-native/Libraries/Utilities/useWindowDimensions', () => {
  const actual = jest.requireActual('react-native/Libraries/Utilities/useWindowDimensions').default;
  return { __esModule: true, default: () => actual() };
});

const App = require('../App').default;
import { readLastScreen, saveLastScreen } from '../src/persistence/uiState';
import { pages } from '../src/app/types';

jest.setTimeout(60000);

beforeEach(() => resetAsyncStorageMock());

type TreeNode = { type: string; props: Record<string, unknown>; children?: (string | TreeNode)[] | string | null };
type TreeRoot = TreeNode | string | null | TreeNode[];

function textNodes(tree: TreeRoot): string[] {
  if (!tree) return [];
  if (typeof tree === 'string') return [tree];
  if (Array.isArray(tree)) return tree.flatMap(textNodes);
  const kids = tree.children;
  return [typeof kids === 'string' ? kids : '', ...(Array.isArray(kids) ? kids.flatMap(textNodes) : [])].filter(Boolean);
}

function findNode(tree: TreeRoot, predicate: (node: TreeNode) => boolean): TreeNode | null {
  if (!tree || typeof tree === 'string') return null;
  if (Array.isArray(tree)) {
    for (const kid of tree) {
      const hit = findNode(kid, predicate);
      if (hit) return hit;
    }
    return null;
  }
  if (predicate(tree)) return tree;
  return findNode((tree.children ?? null) as TreeRoot, predicate);
}

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

async function pressByLabel(tree: ReactTestRenderer, label: string): Promise<void> {
  const button = findNode(tree.toJSON(), node => node.props.accessibilityLabel === label);
  const handler = button?.props.onClick ?? button?.props.onPress ?? button?.props.onResponderRelease;
  if (!button || typeof handler !== 'function') throw new Error(`no pressable labelled "${label}"`);
  await act(async () => {
    (handler as () => void)();
  });
}

// ---------------------------------------------------------------------------
// The welcome screen
// ---------------------------------------------------------------------------

test('the home screen shows the three steps and one way in', async () => {
  const tree = await mount(React.createElement(App, { initialScreen: 'home' }));
  const landed = textNodes(tree.toJSON()).join(' \n ');
  expect(landed).toContain('Dispatch AI');
  expect(landed).toContain('Dispatch');
  expect(landed).toContain('Observe');
  expect(landed).toContain('Done');
  expect(landed).toContain('Start working');
  await unmount(tree);
});

test('Start working on the home screen lands on the dashboard', async () => {
  const tree = await mount(React.createElement(App, { initialScreen: 'home' }));
  await pressByLabel(tree, 'Start working');
  const landed = textNodes(tree.toJSON()).join(' \n ');
  expect(landed).toContain('Tokens used');
  await unmount(tree);
});

// ---------------------------------------------------------------------------
// The dashboard
// ---------------------------------------------------------------------------

test('the dashboard shows six stat cards, all zero on a fresh install', async () => {
  const tree = await mount(React.createElement(App, { initialScreen: 'dashboard' }));
  const landed = textNodes(tree.toJSON()).join(' \n ');
  for (const label of ['Waiting', 'Runs today', 'Done', 'Failed', 'Tokens used', 'Agents']) {
    expect(landed).toContain(label);
  }
  // No fake data: every card starts at zero, and the tokens card says 0 on an empty ledger.
  const zeros = landed.split('\n').filter(line => line.trim() === '0');
  expect(zeros.length).toBeGreaterThanOrEqual(6);
  await unmount(tree);
});

test('the dashboard empty states invite the first team, agent and dispatch', async () => {
  const tree = await mount(React.createElement(App, { initialScreen: 'dashboard' }));
  const landed = textNodes(tree.toJSON()).join(' \n ');
  expect(landed).toContain('Soooo Emptyyyy');
  expect(landed).toContain('Make team?');
  expect(landed).toContain('Where did everyone go?');
  expect(landed).toContain('Make agent');
  expect(landed).toContain('Nothing waiting');
  expect(landed).toContain('New dispatch');
  await unmount(tree);
});

// ---------------------------------------------------------------------------
// The shortcuts
// ---------------------------------------------------------------------------

test('Ctrl+2 on the shell jumps to the second page, and a plain 2 does not', async () => {
  const tree = await mount(React.createElement(App, { initialScreen: 'home' }));
  const shell = findNode(tree.toJSON(), node => typeof node.props.onKeyDown === 'function');
  if (!shell) throw new Error('the shell view carries no key handler');
  const onKeyDown = shell.props.onKeyDown as (event: unknown) => void;

  // A plain digit must reach the composer untouched: no screen change.
  await act(async () => { onKeyDown({ nativeEvent: { key: '2' } }); });
  expect(textNodes(tree.toJSON()).join(' ')).toContain('Start working');

  // Ctrl+2 jumps to the second page (Dashboard).
  await act(async () => { onKeyDown({ nativeEvent: { key: '2', ctrlKey: true } }); });
  expect(textNodes(tree.toJSON()).join(' ')).toContain('Tokens used');

  // Cmd (metaKey) works the same as Ctrl.
  await act(async () => { onKeyDown({ nativeEvent: { key: '1', metaKey: true } }); });
  expect(textNodes(tree.toJSON()).join(' ')).toContain('Start working');
  await unmount(tree);
});

test('the shortcut indices follow the pages list, not a hard-coded screen order', () => {
  // Ctrl+1..9 maps onto the first nine entries of `pages`; this pins that contract so a
  // reordered nav cannot silently move the shortcuts.
  expect(pages.slice(0, 9).map(page => page.id)).toEqual([
    'home', 'dashboard', 'dispatch', 'design', 'computerUse', 'chat', 'runs', 'results', 'board',
  ]);
});

// ---------------------------------------------------------------------------
// Last-screen persistence
// ---------------------------------------------------------------------------

describe('uiState last-screen persistence', () => {
  it('reads back a stored screen', async () => {
    storageBacking.set('dispatch.ui.screen.v1', 'dashboard');
    await expect(readLastScreen()).resolves.toBe('dashboard');
  });

  it('treats a stored value that is not a current page as absent', async () => {
    storageBacking.set('dispatch.ui.screen.v1', 'deleted-screen-from-an-old-build');
    await expect(readLastScreen()).resolves.toBeNull();
  });

  it('returns null when the store itself fails', async () => {
    storageFailures.get = true;
    await expect(readLastScreen()).resolves.toBeNull();
  });

  it('saves the screen under the versioned key, and swallows a write failure', async () => {
    saveLastScreen('agents');
    await new Promise<void>(resolve => { setImmediate(() => resolve()); });
    expect(storageBacking.get('dispatch.ui.screen.v1')).toBe('agents');
    storageFailures.set = true;
    saveLastScreen('runs'); // must not throw
    await new Promise<void>(resolve => { setImmediate(() => resolve()); });
    expect(storageBacking.get('dispatch.ui.screen.v1')).toBe('agents');
  });
});
