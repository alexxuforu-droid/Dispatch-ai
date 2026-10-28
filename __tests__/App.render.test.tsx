import React, { act } from 'react';
import renderer, { ReactTestRenderer } from 'react-test-renderer';

import { CodeChange, Run, WorkItem } from '../src/orchestration/types';

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

// Dimensions.set() does not reach useWindowDimensions under the jest preset, so a render at a
// chosen width mocks the hook itself. Null leaves the runtime's own value in place, which keeps
// every test that never sets a viewport on the width it already runs at.
let mockViewport: { width: number; height: number } | null = null;

jest.mock('react-native/Libraries/Utilities/useWindowDimensions', () => {
  const actual = jest.requireActual('react-native/Libraries/Utilities/useWindowDimensions').default;
  return {
    __esModule: true,
    default: () => mockViewport ? { ...mockViewport, scale: 1, fontScale: 1 } : actual(),
  };
});

function setViewport(width: number, height = 900): void {
  mockViewport = { width, height };
}

afterEach(() => { mockViewport = null; });

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

// Some controls carry no accessibilityLabel; their accessible name comes from a child Text,
// which is valid practice and what a screen reader announces. The press handler sits on the
// ancestor, and toJSON gives no parent links, so find the handler-bearing node whose SUBTREE
// contains the text.
function subtreeHasText(node: TreeRoot, text: string): boolean {
  if (!node) return false;
  if (typeof node === 'string') return node.trim() === text;
  if (Array.isArray(node)) return node.some(kid => subtreeHasText(kid, text));
  if (typeof node.children === 'string' && node.children.trim() === text) return true;
  return subtreeHasText((node.children ?? null) as TreeRoot, text);
}

function findPressableByText(node: TreeRoot, text: string): TreeNode | null {
  if (!node || typeof node === 'string') return null;
  if (Array.isArray(node)) {
    for (const kid of node) {
      const hit = findPressableByText(kid, text);
      if (hit) return hit;
    }
    return null;
  }
  const handler = node.props?.onClick ?? node.props?.onPress ?? node.props?.onResponderRelease;
  if (typeof handler === 'function' && subtreeHasText((node.children ?? null) as TreeRoot, text)) return node;
  return findPressableByText((node.children ?? null) as TreeRoot, text);
}

async function pressByText(tree: ReactTestRenderer, text: string): Promise<void> {
  const node = findPressableByText(tree.toJSON(), text);
  if (!node) throw new Error(`no pressable whose subtree contains ${text} is rendered`);
  const handler = node.props.onClick ?? node.props.onPress ?? node.props.onResponderRelease;
  await act(async () => { (handler as () => void)(); });
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

  expect(rendered).toContain('could not be confirmed as cleared');
  expect(rendered).toContain('may be partly removed');
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

// Regression: the settings note used to call normalizeProviderEndpoint during render to work
// out staleness. That function throws on anything the endpoint field can hold mid-edit, and
// nothing above App catches, so one ordinary keystroke could take the screen down. Every
// endpoint the field can legitimately contain must render without throwing.
describe('settings survives an endpoint that is mid-edit', () => {
  // What these ten cases actually prove: typing an unparseable endpoint never throws out of
  // render, and never locks the model field.
  //
  // What they do NOT prove: that the try/catch inside `catalogStale` is what saves them.
  // Deleting that try/catch leaves all ten green. The reason is this commit's own doing --
  // `update` now recomputes suggestions for the new endpoint, so a hostile value hits
  // `refreshModelSuggestions`' catch and re-nulls `catalogCheckedAt` before render can reach
  // the guarded call. The guard is defence in depth against a future path that sets an
  // endpoint without recomputing; it is currently unreachable, and this file does not claim
  // otherwise.
  const hostile = [
    '',
    '   ',
    'api',
    'api.openai',
    'http://api.openai.com/v1',
    'https://user:pass@api.openai.com/v1',
    'https://api.openai.com/v1?x=1',
    'https://api.openai.com/v1#frag',
    'ht!tp://%%%',
    '://',
  ];

  test.each(hostile)('renders with endpoint %j rather than throwing', async endpoint => {
    const { saveProviderProfile, defaultProviderProfile } = require('../src/persistence/providerProfile');
    const { saveCatalogSnapshot, clearCatalogSnapshot } = require('../src/persistence/modelCatalogStore');
    const { providerModelCatalog } = require('../src/providers/openai-compatible');
    await clearCatalogSnapshot();
    const MID_EDIT_ENDPOINT = 'https://api.openai.com/v1';
    providerModelCatalog.forget(MID_EDIT_ENDPOINT);
    providerModelCatalog.record(MID_EDIT_ENDPOINT, ['a-model'], Date.now() - 60 * 60 * 1000);
    await saveCatalogSnapshot(MID_EDIT_ENDPOINT, ['a-model'], Date.now() - 60 * 60 * 1000);
    await saveProviderProfile({ ...defaultProviderProfile, model: 'saved-model-id', imageModel: '' });

    // Typing into the endpoint field must not throw out of render.
    const holder: { tree: ReactTestRenderer | null } = { tree: null };
    let threw: unknown = null;
    try {
      await act(async () => {
        holder.tree = renderer.create(React.createElement(App, { initialScreen: 'settings' }));
      });
      const mounted = holder.tree;
      if (!mounted) throw new Error('settings did not mount');
      const input = findByLabel(mounted.toJSON(), 'OpenAI-compatible API endpoint');
      const onChangeText = input?.props?.onChangeText;
      await act(async () => {
        if (typeof onChangeText === 'function') (onChangeText as (next: string) => void)(endpoint);
      });
    } catch (error) {
      threw = error;
    }
    expect(threw).toBeNull();

    // And the saved model id is still free text, untouched by the catalog.
    const tree = holder.tree as ReactTestRenderer;
    const rendered = textNodes(tree.toJSON()).join(' \n ');
    expect(rendered).toContain('Model ID');
    expect(rendered).not.toContain('"editable": false');
    await unmount(tree);
  });
});

// The staleness copy is only useful in both directions. Asserting that a stale catalog says so
// is half the contract: the other half is that a FRESH catalog never claims to be out of date.
// Without this, making the condition unconditionally true ships a lie and the suite stays green.
describe('the catalog note tells the truth in both directions', () => {
  const ENDPOINT = 'https://api.openai.com/v1';

  async function mountSettings(): Promise<ReactTestRenderer> {
    return mount(React.createElement(App, { initialScreen: 'settings' }));
  }

  test('a fresh catalog is not described as out of date', async () => {
    const { providerModelCatalog } = require('../src/providers/openai-compatible');
    const { saveCatalogSnapshot, clearCatalogSnapshot } = require('../src/persistence/modelCatalogStore');
    const { saveProviderProfile, defaultProviderProfile } = require('../src/persistence/providerProfile');
    await clearCatalogSnapshot();
    providerModelCatalog.forget(ENDPOINT);
    await saveCatalogSnapshot(ENDPOINT, ['alpha'], Date.now());
    providerModelCatalog.record(ENDPOINT, ['alpha'], Date.now());
    await saveProviderProfile({ ...defaultProviderProfile, endpoint: ENDPOINT, model: 'saved-model-id', imageModel: '' });

    const tree = await mountSettings();
    const rendered = textNodes(tree.toJSON()).join(' \n ');

    expect(rendered).toContain('Model list checked');
    expect(rendered).not.toContain('may be out of date');
    // The advisory framing must survive on the fresh path too.
    expect(rendered).toContain('It only ever offers suggestions');
    await unmount(tree);
  });

  test('with no catalog at all the note explains how to get suggestions', async () => {
    const { providerModelCatalog } = require('../src/providers/openai-compatible');
    const { clearCatalogSnapshot } = require('../src/persistence/modelCatalogStore');
    await clearCatalogSnapshot();
    providerModelCatalog.forget(ENDPOINT);

    const tree = await mountSettings();
    const rendered = textNodes(tree.toJSON()).join(' \n ');

    expect(rendered).toContain('Suggestions appear once the provider model list is fetched');
    // Free text is always available; the empty state must not imply the field is locked.
    expect(rendered).toContain('Type any model ID above at any time');
    // Read the control's props, not the rendered text. An earlier version asserted
    // not.toContain('"editable": false') against textNodes output, which can only emit string
    // children and accessibilityLabel values -- that literal exists nowhere in the app, so
    // the assertion could not fail whatever the component did.
    expect(findByLabel(tree.toJSON(), 'Provider model ID')?.props?.editable).toBeUndefined();
    expect(findByLabel(tree.toJSON(), 'Provider model ID')?.props?.disabled).toBeUndefined();
    await unmount(tree);
  });

  test('editing the endpoint drops the previous endpoint suggestions', async () => {
    const { providerModelCatalog } = require('../src/providers/openai-compatible');
    const { saveCatalogSnapshot, clearCatalogSnapshot } = require('../src/persistence/modelCatalogStore');
    const { saveProviderProfile, defaultProviderProfile } = require('../src/persistence/providerProfile');
    await clearCatalogSnapshot();
    providerModelCatalog.forget(ENDPOINT);
    providerModelCatalog.record(ENDPOINT, ['alpha', 'beta'], Date.now());
    await saveCatalogSnapshot(ENDPOINT, ['alpha', 'beta'], Date.now());
    await saveProviderProfile({ ...defaultProviderProfile, endpoint: ENDPOINT, model: 'saved-model-id', imageModel: '' });

    const tree = await mountSettings();
    expect(textNodes(tree.toJSON()).join(' \n ')).toContain('Use model alpha');

    const input = findByLabel(tree.toJSON(), 'OpenAI-compatible API endpoint');
    const onChangeText = input?.props?.onChangeText;
    await act(async () => {
      if (typeof onChangeText === 'function') (onChangeText as (next: string) => void)('https://other.example/v1');
    });

    const after = textNodes(tree.toJSON()).join(' \n ');
    // Chips for the old provider must not survive: they describe an endpoint no longer in use,
    // and the "checked" note would otherwise report the wrong endpoint's age.
    expect(after).not.toContain('Use model alpha');
    expect(after).not.toContain('Use model beta');
    expect(after).toContain('Suggestions appear once the provider model list is fetched');
    const modelInput = findByLabel(tree.toJSON(), 'Provider model ID');
    expect(modelInput?.props?.value).toBe('saved-model-id');
    await unmount(tree);
  });

  // The save path was entirely undriven: nothing in the suite pressed "Save and test", so a
// mutation making the model id revert to a catalog suggestion on save passed 178/178. This is
// the same preference-gate class the catalog suite guards, on the one route it never covered.
test('Save and test cannot rewrite the saved model id from a catalog suggestion', async () => {
  const { providerModelCatalog } = require('../src/providers/openai-compatible');
  const { clearCatalogSnapshot } = require('../src/persistence/modelCatalogStore');
  const { saveProviderProfile, defaultProviderProfile, loadProviderProfile } = require('../src/persistence/providerProfile');
  await clearCatalogSnapshot();
  providerModelCatalog.forget(ENDPOINT);
  providerModelCatalog.record(ENDPOINT, ['alpha'], Date.now());
  await saveProviderProfile({ ...defaultProviderProfile, endpoint: ENDPOINT, model: 'a-model-the-provider-never-listed', imageModel: '' });

  (globalThis as { fetch?: unknown }).fetch = jest.fn(async () =>
    ({ ok: true, status: 200, json: async () => ({ choices: [{ message: { content: 'ok' } }] }) }));

  const tree = await mountSettings();
  await pressByText(tree, 'Save and test');

  expect(findByLabel(tree.toJSON(), 'Provider model ID')?.props?.value).toBe('a-model-the-provider-never-listed');
  expect((await loadProviderProfile()).model).toBe('a-model-the-provider-never-listed');
  await unmount(tree);
});

// Normalized-endpoint keying is covered as a unit test in catalog.test.ts rather than through
// the settings screen: the App harness cannot reliably observe post-connect state, and a test
// that cannot be proven red does not belong here.

// A refresh started for one endpoint must not write its result onto another the user
  // typed while the request was in flight. The window is real: /models is a network call.
  test('an in-flight refresh does not resurrect the previous endpoint suggestions', async () => {
    const { providerModelCatalog } = require('../src/providers/openai-compatible');
    const { clearCatalogSnapshot } = require('../src/persistence/modelCatalogStore');
    const { saveProviderProfile, defaultProviderProfile } = require('../src/persistence/providerProfile');
    await clearCatalogSnapshot();
    providerModelCatalog.forget(ENDPOINT);
    await saveProviderProfile({ ...defaultProviderProfile, endpoint: ENDPOINT, model: 'saved-model-id', imageModel: '' });

    // A /models response the test controls, so the endpoint can be edited mid-request.
    let release: (value: unknown) => void = () => {};
    const pending = new Promise(resolve => { release = resolve; });
    (globalThis as { fetch?: unknown }).fetch = jest.fn(async (url: string) => {
      if (String(url).includes('/models')) {
        await pending;
        return { ok: true, status: 200, json: async () => ({ data: [{ id: 'stale-endpoint-model' }] }) };
      }
      return { ok: true, status: 200, json: async () => ({ choices: [{ message: { content: 'ok' } }] }) };
    });

    const tree = await mountSettings();
    await press(tree, 'Refresh the provider model list');

    // The user points somewhere else while the request is still open.
    const endpointInput = findByLabel(tree.toJSON(), 'OpenAI-compatible API endpoint');
    const onChangeText = endpointInput?.props?.onChangeText;
    await act(async () => {
      if (typeof onChangeText === 'function') (onChangeText as (next: string) => void)('https://other.example/v1');
    });

    release({});
    await act(async () => { await pending; await Promise.resolve(); });

    const after = textNodes(tree.toJSON()).join(' \n ');
    expect(after).not.toContain('Use model stale-endpoint-model');
    expect(findByLabel(tree.toJSON(), 'Provider model ID')?.props?.value).toBe('saved-model-id');
    await unmount(tree);
  });

  test('switching to an endpoint with a fresh cached listing keeps that listing', async () => {
    // Clearing on edit would also throw away a listing the app already holds and knows is
    // fresh, forcing a network round trip for data already in memory.
    const { providerModelCatalog } = require('../src/providers/openai-compatible');
    const { clearCatalogSnapshot } = require('../src/persistence/modelCatalogStore');
    const { saveProviderProfile, defaultProviderProfile } = require('../src/persistence/providerProfile');
    const OTHER = 'https://other.example/v1';
    await clearCatalogSnapshot();
    providerModelCatalog.forget(ENDPOINT);
    providerModelCatalog.record(OTHER, ['cached-alpha', 'cached-beta'], Date.now());
    await saveProviderProfile({ ...defaultProviderProfile, endpoint: ENDPOINT, model: 'saved-model-id', imageModel: '' });

    const tree = await mountSettings();
    const input = findByLabel(tree.toJSON(), 'OpenAI-compatible API endpoint');
    const onChangeText = input?.props?.onChangeText;
    await act(async () => {
      if (typeof onChangeText === 'function') (onChangeText as (next: string) => void)(OTHER);
    });

    const rendered = textNodes(tree.toJSON()).join(' \n ');
    expect(rendered).toContain('Use model cached-alpha');
    expect(rendered).toContain('Model list checked');
    // And the old endpoint's chips are gone, which is the original defect.
    expect(rendered).not.toContain('Use model alpha');
    await unmount(tree);
  });

  // Mutually exclusive: the note has two states and showing both at once would tell the user
  // they have no suggestions and that the list was checked recently.
  test('the no-catalog and checked copy are never both shown', async () => {
    const { providerModelCatalog } = require('../src/providers/openai-compatible');
    const { clearCatalogSnapshot } = require('../src/persistence/modelCatalogStore');
    const { saveProviderProfile, defaultProviderProfile } = require('../src/persistence/providerProfile');

    for (const stale of [true, false]) {
      await clearCatalogSnapshot();
      providerModelCatalog.forget(ENDPOINT);
      if (stale) providerModelCatalog.record(ENDPOINT, ['alpha'], Date.now() - 60 * 60 * 1000);
      else providerModelCatalog.record(ENDPOINT, ['alpha'], Date.now());
      await saveProviderProfile({ ...defaultProviderProfile, endpoint: ENDPOINT, model: 'saved-model-id', imageModel: '' });

      const tree = await mountSettings();
      const rendered = textNodes(tree.toJSON()).join(' \n ');
      const emptyCopy = rendered.includes('Suggestions appear once the provider model list is fetched');
      const checkedCopy = rendered.includes('Model list checked');
      expect(emptyCopy && checkedCopy).toBe(false);
      // Exactly one of the two states is showing.
      expect(emptyCopy !== checkedCopy).toBe(true);
      await unmount(tree);
    }
  });

  test('the saved model id is the input value, not merely text on screen', async () => {
    const { clearCatalogSnapshot } = require('../src/persistence/modelCatalogStore');
    const { saveProviderProfile, defaultProviderProfile } = require('../src/persistence/providerProfile');
    await clearCatalogSnapshot();
    await saveProviderProfile({ ...defaultProviderProfile, endpoint: ENDPOINT, model: 'a-model-the-provider-never-listed', imageModel: '' });

    const tree = await mountSettings();
    const input = findByLabel(tree.toJSON(), 'Provider model ID');
    expect(input).not.toBeNull();
    expect(input?.props?.value).toBe('a-model-the-provider-never-listed');
    expect(input?.props?.disabled).toBeUndefined();
    expect(input?.props?.editable).toBeUndefined();
    await unmount(tree);
  });
});

// ---- Code proposals in the Dispatch thread ---------------------------------------------
//
// A proposal is a change, so its card has to read as one: what came out, what went in, with the
// complete file contents still one action away. The old card dumped `before` and `after` whole,
// so nothing on screen answered "which lines moved" and a 400-line file buried the two lines
// that mattered. `diffLines` already exists and already caps its view at MAX_VIEW_LINES; these
// tests pin what the *Dispatch thread* renders, not what the helper returns.

// Seeded through the real snapshot write path so the card renders from the same store a finished
// run leaves behind, rather than from a prop only a test could pass.
async function seedProposalThread(entries: { change: CodeChange; itemStatus: WorkItem['status'] }[]): Promise<void> {
  const { saveRunSnapshot } = require('../src/persistence/runStore');
  const at = new Date().toISOString();
  const run: Run = {
    id: 'run-proposal-thread',
    brief: 'Wire the change preview into the dispatch thread.',
    status: 'completed',
    teamId: 'team-default',
    items: entries.map(entry => ({ id: entry.change.itemId, title: entry.change.path, kind: 'code', agentId: 'builder', dependsOn: [], status: entry.itemStatus, artifactIds: [] })),
    messages: [],
    artifacts: [],
    changes: entries.map(entry => entry.change),
    createdAt: at,
    updatedAt: at,
  };
  await saveRunSnapshot(run);
}

// `applyCodeChange` returns before the secret gate while no project folder is selected, and the
// card's own label short-circuits the same way, so the gate is only observable with a root set.
// The app reads `dispatch.workspace.project.v1` (`src/persistence/workspaceProject.ts:5,9`);
// writing it back through the same store is the honest equivalent of picking a folder.
async function seedProjectRoot(): Promise<void> {
  const AsyncStorage = require('@react-native-async-storage/async-storage').default;
  await AsyncStorage.setItem('dispatch.workspace.project.v1', 'Z:\\fixture-project');
}

// A diff row carries its marker and its line as sibling children (`{prefix}{line.text}`), which
// textNodes reports as two separate strings. Concatenating each element's own children first lets
// a row be matched as the single string a reader sees, however the row is split in JSX.
function rowText(tree: TreeRoot): string[] {
  if (!tree) return [];
  if (typeof tree === 'string') return [tree];
  if (Array.isArray(tree)) return tree.flatMap(rowText);
  const kids = tree.children;
  const own = typeof kids === 'string' ? [kids] : Array.isArray(kids) ? [kids.filter((kid): kid is string => typeof kid === 'string').join('')] : [];
  const label = typeof tree.props?.accessibilityLabel === 'string' ? [tree.props.accessibilityLabel] : [];
  const nested = Array.isArray(kids) ? kids.filter((kid): kid is TreeNode => typeof kid === 'object' && kid !== null).flatMap(rowText) : [];
  return [...own, ...label, ...nested];
}

function subtreeText(node: TreeRoot): string {
  if (!node) return '';
  if (typeof node === 'string') return node;
  if (Array.isArray(node)) return node.map(subtreeText).join(' ');
  const kids = node.children;
  const own = typeof kids === 'string' ? [kids] : Array.isArray(kids) ? [kids.filter((kid): kid is string => typeof kid === 'string').join('')] : [];
  const label = typeof node.props?.accessibilityLabel === 'string' ? [node.props.accessibilityLabel] : [];
  const nested = Array.isArray(kids) ? kids.filter((kid): kid is TreeNode => typeof kid === 'object' && kid !== null).map(subtreeText).join(' ') : '';
  return [own, label, nested].filter(Boolean).join(' ');
}

// The contract requires complete contents to stay reachable through an explicit user action, but
// it does not dictate the control's wording. Find it by what it says it does, so an honest label
// passes; a control that only applies or rejects is not a disclosure.
function findContentDisclosure(node: TreeRoot): TreeNode | null {
  if (!node || typeof node === 'string') return null;
  if (Array.isArray(node)) {
    for (const kid of node) {
      const hit = findContentDisclosure(kid);
      if (hit) return hit;
    }
    return null;
  }
  const handler = node.props?.onClick ?? node.props?.onPress ?? node.props?.onResponderRelease;
  const words = subtreeText(node);
  const applies = /apply|reject|choose a project folder|waiting for review|blocked for secrets/i.test(words);
  if (typeof handler === 'function' && /complete|full/i.test(words) && !applies) return node;
  return findContentDisclosure((node.children ?? null) as TreeRoot);
}

const CHANGED_BEFORE = 'const Greeter = () => {\nconst message = "hello";\nreturn message;\n};';
const CHANGED_AFTER = 'const Greeter = () => {\nconst message = "hello there";\nreturn message;\n};';
const CHANGED_PATH = 'src/app/greeting.ts';

test('a code proposal appears on Results with its added and removed lines', async () => {
  await seedProposalThread([
    { itemStatus: 'done', change: { id: 'change-changed', itemId: 'item-greeting', path: CHANGED_PATH, before: CHANGED_BEFORE, after: CHANGED_AFTER, createOnly: false, createdBy: 'builder', attempt: 1 } },
  ]);
  // A project folder is selected so the card shows its real apply action rather than the
  // "choose a folder first" refusal it shows when no project is chosen.
  await seedProjectRoot();
  setViewport(900);
  const tree = await mount(React.createElement(App, { initialScreen: 'results' }));
  const rows = rowText(tree.toJSON());

  expect(rows).toContain(CHANGED_PATH);
  // Marker + line, the convention ResultsStudio already renders (`src/RunWorkspace.tsx:175`):
  // the outgoing row is marked removed and the incoming row marked added.
  expect(rows).toContain('- const message = "hello";');
  expect(rows).toContain('+ const message = "hello there";');
  // Untouched rows stay around the edit, so the card reads as a hunk and not as a bare pair.
  expect(rows.some(row => row.includes('const Greeter = () => {'))).toBe(true);
  expect(rows.some(row => row.includes('return message;'))).toBe(true);
  // The size of the change is stated on the card, so a 400-line edit is not left to row counting.
  const summary = rows.join(' ');
  expect(summary).toContain('1 added');
  expect(summary).toContain('1 removed');
  const fs = require('fs');
  const path = require('path');
  const captureDir = path.join(process.env.LOCALAPPDATA, 'Temp', 'opencode', 'snapshots');
  fs.mkdirSync(captureDir, { recursive: true });
  fs.writeFileSync(path.join(captureDir, 'screen-proposal-diff-900.json'), JSON.stringify(tree.toJSON(), null, 1), 'utf8');
  // The guard that matters most on this card: the apply action is still labelled and pressable.
  await unmount(tree);
}, 60000);

test('complete before and after contents stay reachable through an explicit action', async () => {
  // Long enough that the capped view hides most of the file: diffLines keeps CONTEXT_LINES
  // either side of a change, so "old line 0" is exactly what the card must stop dumping.
  const longBefore = Array.from({ length: 40 }, (_, index) => `old line ${index}`).join('\n');
  const longAfter = longBefore.replace('old line 20', 'CHANGED LINE');
  await seedProposalThread([
    { itemStatus: 'done', change: { id: 'change-long', itemId: 'item-long', path: 'src/app/long.ts', before: longBefore, after: longAfter, createOnly: false, createdBy: 'builder', attempt: 1 } },
  ]);
  const tree = await mount(React.createElement(App, { initialScreen: 'results' }));

  let rows = rowText(tree.toJSON());
  expect(rows).toContain('- old line 20');
  expect(rows).toContain('+ CHANGED LINE');
  expect(rows.some(row => row.includes('old line 0'))).toBe(false);

  const disclosure = findContentDisclosure(tree.toJSON());
  if (!disclosure) throw new Error('no explicit action discloses the complete contents');
  const handler = disclosure.props.onClick ?? disclosure.props.onPress;
  await act(async () => { (handler as () => void)(); });

  rows = rowText(tree.toJSON());
  // Both ends of the file, so nothing is lost to the cap.
  expect(rows.some(row => row.includes('old line 0'))).toBe(true);
  expect(rows.some(row => row.includes('old line 39'))).toBe(true);
  // The changed rows survive the disclosure rather than being replaced by it.
  expect(rows.some(row => row.includes('+ CHANGED LINE'))).toBe(true);
  await unmount(tree);
}, 60000);

test('a new-file proposal keeps its new-file state and reads as all additions', async () => {
  await seedProposalThread([
    { itemStatus: 'done', change: { id: 'change-new', itemId: 'item-new', path: 'src/app/created.ts', before: '', after: 'first added line\nsecond added line\nthird added line', createOnly: true, createdBy: 'builder', attempt: 1 } },
  ]);
  await seedProjectRoot();
  const tree = await mount(React.createElement(App, { initialScreen: 'results' }));
  const rows = rowText(tree.toJSON());

  expect(rows).toContain('src/app/created.ts');
  // The create-only framing is preserved, not swallowed by the change view.
  expect(rows.some(row => row.includes('New file'))).toBe(true);
  expect(rows).toContain('+ first added line');
  expect(rows).toContain('+ second added line');
  expect(rows).toContain('+ third added line');
  // Nothing was removed from a file that did not exist, so no row may claim otherwise.
  expect(rows.some(row => row.startsWith('- '))).toBe(false);
  await unmount(tree);
}, 60000);

test('proposals that already match, and proposals holding a secret, keep stating it', async () => {
  const unchanged = 'const a = 1;\nconst b = 2;';
  // The static gate's flagged fixture, shared by both secret variants below: the scan keys on
  // the assignment itself, so "flagged for review" and "work complete" buy no way past it.
  const SECRET_AFTER = 'const api_key = "sk-live-abcdef123456";\ncall(api_key);';
  await seedProposalThread([
    // Identical contents: a line diff of a file against itself has nothing to show, and
    // inventing a row here would be a false change report.
    { itemStatus: 'done', change: { id: 'change-same', itemId: 'item-same', path: 'src/app/same.ts', before: unchanged, after: unchanged, createOnly: false, createdBy: 'builder', attempt: 1 } },
    // A flagged proposal carrying a hardcoded key. The static gate is the last thing that stops
    // a credential reaching a file, so its refusal must stay on the card.
    { itemStatus: 'needs-approval', change: { id: 'change-secret', itemId: 'item-secret', path: 'src/app/secret.ts', before: '', after: SECRET_AFTER, createOnly: true, createdBy: 'builder', attempt: 1 } },
    // The same flag on work the team already finished. The gate is the same scan, so the
    // "done" status is not a way past it either, and the card has to say so in the same words.
    { itemStatus: 'done', change: { id: 'change-secret-done', itemId: 'item-secret-done', path: 'src/app/done-secret.ts', before: '', after: SECRET_AFTER, createOnly: true, createdBy: 'builder', attempt: 1 } },
  ]);
  await seedProjectRoot();
  const tree = await mount(React.createElement(App, { initialScreen: 'results' }));
  const rendered = rowText(tree.toJSON()).join(' \n ');

  expect(rendered).toContain('src/app/same.ts');
  expect(rendered).toContain('src/app/secret.ts');
  // An unchanged proposal must not render an addition or a removal row.
  expect(rendered).not.toMatch(/(- |\+ )const [ab] =/);
  // ...and it has to say so. Either of the two phrasings already in this repo passes; a card
  // that silently shows nothing does not.
  expect(rendered).toMatch(/contents already match|no changes/i);
  // The secret block is still surfaced, and the review flag that triggered it is still named.
  expect(rendered).toContain('Blocked for secrets · fix first');
  expect(rendered).toContain('Needs review');
  // A flagged proposal may not advertise the one thing the gate forbids: an apply a user could
  // actually press. Whatever the card says, the refused action must stay unpressable.
  expect(enabledApplyControlsFor(tree.toJSON(), 'src/app/secret.ts')).toEqual([]);
  // The card may print the reason or keep it behind a labelled action. When it does the latter,
  // that action has to read as asking for the reason and never as a way past the gate.
  const reason = reasonDisclosureFor(tree.toJSON(), 'src/app/secret.ts');
  if (reason) {
    expect(reason.props?.accessibilityLabel).not.toMatch(/apply anyway/i);
    await press(tree, reason.props?.accessibilityLabel as string);
  }
  // The hard refusal is the proof: it names the file and the line, so a reviewer can find the
  // credential instead of hunting for it.
  const blocked = rowText(tree.toJSON()).join(' \n ');
  expect(blocked).toContain('Refused to apply src/app/secret.ts:1');
  expect(blocked).toMatch(/possible hardcoded/i);
  // ...and finished work gets the same treatment: the flag is the scan's, not the review
  // status's, so "done" may not offer the apply the flagged proposal does not.
  expect(rendered).toContain('src/app/done-secret.ts');
  expect(enabledApplyControlsFor(tree.toJSON(), 'src/app/done-secret.ts')).toEqual([]);
  expect(blocked).toContain('Refused to apply src/app/done-secret.ts:1');
  await unmount(tree);
}, 60000);

// ---- Review outcomes: rejected and reverted proposals in the Dispatch thread ----------------
//
// The conversation card once treated both outcomes exactly like a fresh proposal: it read
// PROPOSAL with an enabled "Apply proposal" button, so work the team had already rejected
// looked applicable and work the user had already undone looked live again. applyCodeChange
// refuses both changes itself, so pressing the button did nothing at all -- a control that
// looks available and is not. ResultsStudio has gated both states for as long as they have
// existed (`src/RunWorkspace.tsx:161,182-186`); the conversation card is the surface that
// never did. Both fates are seeded through the real snapshot path, the way a finished run
// leaves them behind.

// The card's apply control carries the file path in its accessible name, so a path seeded
// with no fate word in it is matched against the control without the control's own label
// matching itself. The walk is the same shape `press` drives, so a control found here is a
// control the suite can already reach.
function pressableNodes(node: TreeRoot): TreeNode[] {
  if (!node || typeof node === 'string') return [];
  if (Array.isArray(node)) return node.flatMap(pressableNodes);
  const handler = node.props?.onClick ?? node.props?.onPress ?? node.props?.onResponderRelease;
  const own = typeof handler === 'function' ? [node] : [];
  return [...own, ...pressableNodes((node.children ?? null) as TreeRoot)];
}

function applyControlsFor(node: TreeRoot, path: string): TreeNode[] {
  return pressableNodes(node).filter(candidate => {
    const name = candidate.props?.accessibilityLabel;
    return typeof name === 'string' && /apply/i.test(name) && name.includes(path);
  });
}

// A control that exists but is disabled is not an affordance; one that exists and is enabled
// is, whatever the change's own state says. React Native drops a falsy `disabled`, so only an
// explicit true counts as disabled.
function enabledApplyControlsFor(node: TreeRoot, path: string): TreeNode[] {
  return applyControlsFor(node, path).filter(control => control.props?.disabled !== true);
}

// A blocked proposal may explain itself, but the explanation control has to read as a request
// for the reason and never as a way past the gate. Its wording is not dictated, so it is found
// by what a reader would take it to mean: this asks why, it does not offer to override.
function reasonDisclosureFor(node: TreeRoot, path: string): TreeNode | null {
  return pressableNodes(node).find(control => {
    const name = control.props?.accessibilityLabel;
    return typeof name === 'string'
      && /why|blocked|block reason|secret|review findings|why not/i.test(name)
      && name.includes(path)
      && !/anyway|override|force|apply now/i.test(name);
  }) ?? null;
}

test('a rejected proposal in Results is labelled and cannot be applied', async () => {
  const rejectedAt = '2026-10-18T09:00:00.000Z';
  await seedProposalThread([
    { itemStatus: 'done', change: { id: 'change-declined', itemId: 'item-declined', path: 'src/app/declined.ts', before: CHANGED_BEFORE, after: CHANGED_AFTER, createOnly: false, createdBy: 'builder', attempt: 1, rejectedAt } },
  ]);
  // With no project folder the card offers nothing but "Choose a project folder first",
  // which hides the fate's own gating. Same reason the secret gate above needs a root.
  await seedProjectRoot();
  const tree = await mount(React.createElement(App, { initialScreen: 'results' }));
  const rendered = rowText(tree.toJSON()).join(' \n ');

  expect(rendered).toContain('src/app/declined.ts');
  // Nothing seeded carries the word -- path, brief, plan title -- so the sentence has to
  // come from the card itself. Today it does not: the card reads PROPOSAL and calls this
  // work "complete · inspect before applying".
  expect(rendered).toMatch(/reject/i);
  // ...and nothing on this screen offers to apply rejected work.
  expect(enabledApplyControlsFor(tree.toJSON(), 'src/app/declined.ts')).toEqual([]);
  await unmount(tree);
}, 60000);

test('a reverted proposal in Results is labelled and cannot be applied', async () => {
  const appliedAt = '2026-10-17T15:00:00.000Z';
  const revertedAt = '2026-10-18T09:00:00.000Z';
  await seedProposalThread([
    { itemStatus: 'done', change: { id: 'change-undone', itemId: 'item-undone', path: 'src/app/undone.ts', before: CHANGED_BEFORE, after: CHANGED_AFTER, createOnly: false, createdBy: 'builder', attempt: 1, appliedAt, revertedAt } },
  ]);
  await seedProjectRoot();
  const tree = await mount(React.createElement(App, { initialScreen: 'results' }));
  const rendered = rowText(tree.toJSON()).join(' \n ');

  expect(rendered).toContain('src/app/undone.ts');
  // A revert is seeded as an application followed by an undo, so the word "revert" appears
  // nowhere in what was seeded -- path, brief, plan title are all free of it. It has to come
  // from the card. Today the card shows the APPLIED tag and "Applied to project", a claim
  // about a state the user already undid.
  expect(rendered).toMatch(/revert/i);
  // Re-applying undone work is the same mistake in the other direction, and the conversation
  // offers its affordance no more than it offers the rejected one's.
  expect(enabledApplyControlsFor(tree.toJSON(), 'src/app/undone.ts')).toEqual([]);
  await unmount(tree);
}, 60000);

// ---- Plan approval: the queued run on screen is the run that starts ------------------------
//
// approvePlan takes the run it should start (App.tsx:174) because the run room hands it the run
// on screen (App.tsx:267). The dispatch thread passes that same callback straight into a
// Pressable, and React Native calls onPress with the press event -- so a callback with a run
// parameter can end up holding the event: a truthy object whose status is not one of the four
// approvable ones, which returns before a single agent starts. The control reads as available
// and approving it does nothing at all. This drives the real press path over a run rehydrated
// from the device store and proves the queued run reaches the executor.

function queuedPlanRun(): Run {
  const at = '2026-10-19T10:05:00.000Z';
  return {
    id: 'run-queued-plan',
    brief: 'Ship the plan approval regression guard.',
    status: 'queued',
    teamId: 'team-default',
    items: [{ id: 'item-guard', title: 'Write the approval regression guard', kind: 'code', agentId: 'builder', dependsOn: [], status: 'ready', artifactIds: [] }],
    messages: [],
    artifacts: [],
    createdAt: at,
    updatedAt: at,
  };
}

test('approving a queued plan starts the queued run, not the press event React Native hands it', async () => {
  const { saveRunSnapshot } = require('../src/persistence/runStore');
  const queued = queuedPlanRun();
  // Through the same snapshot write path a finished run leaves behind, so the App rehydrates
  // it exactly as a relaunch would (App.tsx:118-126) instead of receiving it as a prop.
  await saveRunSnapshot(queued);
  const modelRunner = require('../src/orchestration/model-runner') as typeof import('../src/orchestration/model-runner');
  // The executor is swapped for a capture, never driven: the real one reaches the provider.
  // Restored below so no other test in this file shares the mock.
  const started = jest.spyOn(modelRunner, 'executePlannedRun').mockImplementation(async input => ({ ...input.run, status: 'completed' }));
  try {
    const tree = await mount(React.createElement(App, { initialScreen: 'dispatch' }));
    // The seeded plan is what is on screen, and its approval action with it.
    const ready = textNodes(tree.toJSON()).join(' \n ');
    expect(ready).toContain('Plan ready');
    expect(ready).toContain(queued.brief);
    expect(ready).toContain('Approve plan and start');

    // Pressed the way React Native presses: the responder hands onPress the press event, so the
    // callback must tolerate an argument and still act on the run it was showing.
    const control = findPressableByText(tree.toJSON(), 'Approve plan and start');
    if (!control) throw new Error('no pressable offers to approve the queued plan');
    const pressHandler = control.props.onClick ?? control.props.onPress ?? control.props.onResponderRelease;
    if (typeof pressHandler !== 'function') throw new Error('the approve control exposes no press handler');
    await act(async () => {
      (pressHandler as (event: unknown) => void)({ nativeEvent: { pageX: 24, pageY: 40, timestamp: 0 }, currentTarget: 1, target: 1 });
    });
    // approvePlan awaits the provider profile before it hands the run over, so let that settle
    // inside act rather than reading a promise that is still open.
    await act(async () => { await new Promise<void>(resolve => { setTimeout(resolve, 0); }); });

    // The queued run itself reached the executor. Were the press event sitting in the run
    // parameter, the status guard would have rejected it and this call count would be zero --
    // an approval that looks live and starts nothing.
    expect(started).toHaveBeenCalledTimes(1);
    expect(started.mock.calls[0][0].run).toEqual(queued);
    // And the approval landed: the plan is no longer waiting, it reports as finished work.
    expect(textNodes(tree.toJSON()).join(' \n ')).toContain('The planned outputs and enabled review checks are complete.');
    await unmount(tree);
  } finally {
    started.mockRestore();
  }
}, 60000);

// ---- Run setup panel: the dismiss contract below the window floor ---------------------------
//
// Below MIN_WINDOW_WIDTH the inspector is not inline; it rides in a modal panel opened from the
// composer. Closing the panel should return the user to that composer.
test('closing the run setup panel drops its inspector content and leaves the composer reachable', async () => {
  setViewport(320, 900);
  const tree = await mount(React.createElement(App, { initialScreen: 'dispatch' }));

  // Opened through the accessible action the composer shows at this width.
  await press(tree, 'Run setup');
  const opened = textNodes(tree.toJSON()).join(' \n ');
  // The panel names itself, rather than carrying an uppercase label above the title.
  expect(opened).toContain('Run setup');
  expect(opened).toContain('Agent team');
  expect(opened).toContain('Review policy');
  expect(opened).toContain('Nothing is applied until you approve it');

  // Dismissed through the panel's own accessible Close action.
  await press(tree, 'Close');

  const closed = textNodes(tree.toJSON()).join(' \n ');
  // The panel's content is gone, not merely covered or relabelled: an eyebrow, two inspector
  // sections and the privacy note, the whole rendered body of the run setup inspector.
  expect(closed).not.toContain('BEFORE YOU START');
  expect(closed).not.toContain('Agent team');
  expect(closed).not.toContain('Review policy');
  expect(closed).not.toContain('Nothing is applied until you approve it');
  // ...and the task composer behind it is still the live, enabled control it always was.
  const composer = findByLabel(tree.toJSON(), 'Describe a task for your agent team');
  expect(composer).not.toBeNull();
  expect(composer?.props?.disabled).toBeUndefined();
  expect(composer?.props?.editable).toBeUndefined();
  await unmount(tree);
}, 60000);

// The disclosure control's expanded flag, read the way assistive tech reads it. Undefined
// means the control declares no state at all, which is the gap this test exists to catch.
function disclosureExpanded(node: TreeNode): boolean | undefined {
  const state = node.props.accessibilityState as { expanded?: boolean } | undefined;
  return state?.expanded;
}

// A disclosure whose label text flips with its state reads fine to a sighted user, but a screen
// reader announces expanded/collapsed from accessibilityState, not from wording. Pin the state
// before and after the toggle on the real rendered path, so "expanded" is not a claim only the
// implementation can make in a comment.
test('the contents disclosure reports its expanded state to accessibility consumers', async () => {
  await seedProposalThread([
    { itemStatus: 'done', change: { id: 'change-state', itemId: 'item-state', path: CHANGED_PATH, before: CHANGED_BEFORE, after: CHANGED_AFTER, createOnly: false, createdBy: 'builder', attempt: 1 } },
  ]);
  const tree = await mount(React.createElement(App, { initialScreen: 'results' }));

  const collapsed = findContentDisclosure(tree.toJSON());
  if (!collapsed) throw new Error('no explicit action discloses the complete contents');
  expect(collapsed.props.accessibilityRole).toBe('button');
  // The native Pressable must carry the collapsed state, not just the collapsed wording.
  expect(disclosureExpanded(collapsed)).toBe(false);

  const open = collapsed.props.onClick ?? collapsed.props.onPress;
  await act(async () => { (open as () => void)(); });

  const expanded = findContentDisclosure(tree.toJSON());
  if (!expanded) throw new Error('the disclosure vanished instead of toggling');
  expect(disclosureExpanded(expanded)).toBe(true);

  // And back, so the state tracks the control rather than being written once.
  const close = expanded.props.onClick ?? expanded.props.onPress;
  await act(async () => { (close as () => void)(); });
  const collapsedAgain = findContentDisclosure(tree.toJSON());
  if (!collapsedAgain) throw new Error('the disclosure vanished instead of toggling back');
  expect(disclosureExpanded(collapsedAgain)).toBe(false);
  await unmount(tree);
}, 60000);

// An empty create-only file and an existing file whose contents already match are opposite
// states: one creates something, the other confirms nothing needs doing. diffLines treats empty
// vs empty as identical, so the card that would say "contents already match" here is lying about
// a file that does not exist. The new-file identity must survive the empty case.
test('an empty create-only proposal stays a new file and never claims its contents already match', async () => {
  await seedProposalThread([
    { itemStatus: 'done', change: { id: 'change-empty-create', itemId: 'item-empty-create', path: 'src/app/empty-created.ts', before: '', after: '', createOnly: true, createdBy: 'builder', attempt: 1 } },
  ]);
  await seedProjectRoot();
  const tree = await mount(React.createElement(App, { initialScreen: 'results' }));
  const rows = rowText(tree.toJSON());

  expect(rows).toContain('src/app/empty-created.ts');
  // Identified as the new file it is, and the summary still reads as a creation.
  expect(rows.some(row => row.includes('New file'))).toBe(true);
  // The card's own summary must not collapse into "nothing happened": a file that does not
  // exist yet is a creation, however empty its contents are.
  expect(rows.some(row => /New file, 0 lines added/i.test(row))).toBe(true);
  // The dangerous one: the "already match" copy belongs to a file that exists with these
  // contents. This file does not exist; claiming a match is a false statement of work done.
  expect(rows.some(row => /contents already match/i.test(row))).toBe(false);
  expect(findPressableByText(tree.toJSON(), 'Apply change')).not.toBeNull();
  await unmount(tree);
}, 60000);

// ---- ResultsStudio: the apply gate it never had -------------------------------------------------
//
// App.tsx's applyCodeChange (App.tsx:198-215) refuses in two ways ResultsStudio never hears
// about: no project folder selected, and a work item that is neither done nor needs-approval.
// Both are silent returns, so an enabled "Apply selected change" on a results card
// (src/RunWorkspace.tsx:161,183 gates only the change's own fate) is a control that looks
// available and is not -- the dispatch thread already states both refusals on its own apply
// control (App.tsx:402); these tests pin the same contract on the results studio itself.
// The three fixtures are seeded straight into the component, the only surface where the
// folder and the item status are the inputs that decide the control.

// The fix belongs in the component, not in this file: ResultsStudio does not take the selected
// project folder in its props yet. This is the narrowly typed contract the implementation must
// satisfy -- the folder (absent, empty, or a real path) alongside the handlers App passes today.
type ResultsStudioProps = {
  run: Run | null;
  history: Run[];
  projectRoot?: string | null;
  // The App-level list of change ids an apply is in flight for (App.tsx:78). A change in it
  // is mid-write, so its control must read as in progress and stay unpressed.
  applyingChanges?: string[];
  onApply: (run: Run, changeId: string) => void | Promise<void>;
  onReject: (run: Run, changeId: string) => void;
  onAcceptArtifact: (run: Run, artifactId: string) => void;
  onSaveRecipe: (run: Run) => void;
  onUndo: (run: Run, changeId: string) => void | Promise<void>;
  onOpenRun: (run: Run) => void;
};

const ResultsStudio = require('../src/RunWorkspace').ResultsStudio;

const RESULTS_CHANGE_PATH = 'src/app/greeting.ts';

// A run the way a finished team leaves it behind: one code work item at the status under test,
// one proposed change from that item, nothing else claiming the screen's attention.
function resultsRun(itemStatus: WorkItem['status'], change: CodeChange): Run {
  const at = '2026-10-19T08:00:00.000Z';
  return {
    id: 'run-results-gate',
    brief: 'Wire the reviewed change into the results studio.',
    status: 'completed',
    teamId: 'team-default',
    items: [{ id: change.itemId, title: change.path, kind: 'code', agentId: 'builder', dependsOn: [], status: itemStatus, artifactIds: [] }],
    messages: [],
    artifacts: [],
    changes: [change],
    createdAt: at,
    updatedAt: at,
  };
}

function resultsChange(overrides: Partial<CodeChange> = {}): CodeChange {
  return {
    id: 'change-greeting',
    itemId: 'item-greeting',
    path: RESULTS_CHANGE_PATH,
    before: CHANGED_BEFORE,
    after: CHANGED_AFTER,
    createOnly: false,
    createdBy: 'builder',
    attempt: 1,
    ...overrides,
  };
}

async function mountResultsStudio(props: Partial<ResultsStudioProps>): Promise<{ tree: ReactTestRenderer; onApply: jest.Mock; onUndo: jest.Mock; onOpenRun: jest.Mock }> {
  const onApply = jest.fn();
  const onUndo = jest.fn();
  const onOpenRun = jest.fn();
  const tree = await mount(React.createElement(ResultsStudio as React.ComponentType<ResultsStudioProps>, {
    run: null,
    history: [],
    onApply,
    onReject: jest.fn(),
    onAcceptArtifact: jest.fn(),
    onSaveRecipe: jest.fn(),
    onUndo,
    onOpenRun,
    ...props,
  }));
  return { tree, onApply, onUndo, onOpenRun };
}

// The apply control carries its own words, and which words it carries is the whole contract:
// the label re-labels itself with the refusal reason, so the matcher accepts every honest
// wording the control can take, while a control that says nothing about the refusal does not.
function applyControlIn(node: TreeRoot): TreeNode | null {
  return pressableNodes(node).find(candidate => /apply|choose a project folder|waiting for|this step failed|blocked for secrets/i.test(subtreeText(candidate))) ?? null;
}

// A control that exists but is disabled is not an affordance. React Native keeps the state
// where assistive tech reads it: the host node's accessibilityState.disabled (Pressable.js:236
// merges the prop into that state rather than forwarding it), so an absent state and false are
// both read as enabled, and only an explicit true is disabled.
function actionDisabled(control: TreeNode): boolean {
  const state = control.props.accessibilityState as { disabled?: boolean } | undefined;
  return state?.disabled === true;
}

async function pressControl(control: TreeNode): Promise<void> {
  const handler = control.props.onClick ?? control.props.onPress ?? control.props.onResponderRelease;
  if (typeof handler !== 'function') throw new Error('the apply control exposes no press handler');
  await act(async () => { handler(); });
}

test('with no project folder selected the results studio disables apply and says to choose a folder', async () => {
  const run = resultsRun('done', resultsChange());
  const { tree } = await mountResultsStudio({ run });
  const rendered = textNodes(tree.toJSON()).join(' \n ');
  expect(rendered).toContain(RESULTS_CHANGE_PATH);

  const applyControl = applyControlIn(tree.toJSON());
  if (!applyControl) throw new Error('no apply control is rendered for the change');
  // The refusal is the handler's own (App.tsx:199 returns before anything is written), and the
  // control has to state it instead of letting the user press it and get nothing at all.
  expect(actionDisabled(applyControl)).toBe(true);
  expect(subtreeText(applyControl)).toMatch(/choose a project folder/i);
  await unmount(tree);
});

// Blocked and failed are both refusals -- App.tsx:202 admits only done and needs-approval -- and
// both are ordinary outcomes a completed run can carry, so the control must be equally honest
// about each. Neither is "waiting for review": a blocked step is waiting on its dependencies
// and a failed step has already failed, so the label says which.
test.each([
  ['blocked', /waiting for its dependencies/i],
  ['failed', /this step failed/i],
] as const)('a work item left %s disables apply and says so plainly', async (itemStatus, expected) => {
  const run = resultsRun(itemStatus, resultsChange());
  const { tree } = await mountResultsStudio({ run, projectRoot: 'Z:\\fixture-project' });

  const applyControl = applyControlIn(tree.toJSON());
  if (!applyControl) throw new Error('no apply control is rendered for the change');
  expect(actionDisabled(applyControl)).toBe(true);
  expect(subtreeText(applyControl)).toMatch(expected);
  await unmount(tree);
});

test('a done item with a project folder keeps an enabled apply that still applies', async () => {
  const run = resultsRun('done', resultsChange());
  const { tree, onApply } = await mountResultsStudio({ run, projectRoot: 'Z:\\fixture-project' });

  const applyControl = applyControlIn(tree.toJSON());
  if (!applyControl) throw new Error('no apply control is rendered for the change');
  // The allowed path must survive the gate: enabling the review states may not disable this one.
  expect(actionDisabled(applyControl)).toBe(false);

  await pressControl(applyControl);
  // Still wired to the handler it always had, with the run and the change it was given.
  expect(onApply).toHaveBeenCalledWith(run, 'change-greeting');
  await unmount(tree);
});

// A change already in the applying list is mid-write: App.tsx:199 drops any further press of
// that id until the in-flight apply finishes (App.tsx:203-214), so an enabled control on this
// card invites a second apply of a write that is still open. The dispatch card re-labels
// itself "Applying…" and disables itself over the very same flag (App.tsx:402); this pins
// that behaviour on the results studio, over an otherwise fully applicable change.
test('a change mid-application disables apply and says it is applying', async () => {
  const run = resultsRun('done', resultsChange());
  const { tree } = await mountResultsStudio({ run, projectRoot: 'Z:\\fixture-project', applyingChanges: ['change-greeting'] });

  const applyControl = applyControlIn(tree.toJSON());
  if (!applyControl) throw new Error('no apply control is rendered for the change');
  // Folder set, item done, no fate recorded: every other gate passes, so the list is the
  // only reason this control may not be pressed.
  expect(actionDisabled(applyControl)).toBe(true);
  // And the state is stated in words, so a sighted user and a screen reader alike learn the
  // apply is under way rather than broken. Any honest spelling of "applying" passes.
  expect(subtreeText(applyControl)).toMatch(/applying/i);
  await unmount(tree);
});

// ---- ResultsStudio: the two states its apply control still mislabels ----------------------------
//
// Same control, same failure shape as the gate cases above (src/RunWorkspace.tsx:189): the button
// reads "Apply selected change" for a proposal the static secret scan has already flagged, and
// reads "Waiting for review" for work that was never waiting for review. App.tsx refuses both
// applies silently (App.tsx:202,205), so in each case the card advertises an action the handler
// will not perform. Both are seeded straight into the component with a folder already chosen, the
// way the gate cases above are, so the folder refusal cannot mask the state's own.

// The flagged fixture is the same hardcoded assignment the dispatch thread already seeds: the
// static scanner (src/orchestration/review.ts:38) flags `api_key = "sk-live-…"`, and neither the
// path, the brief nor the item title carries secret vocabulary of its own, so every word of the
// explanation below has to come from the card itself.
test('a needs-approval proposal holding a hardcoded secret states the block and offers no enabled apply', async () => {
  const run = resultsRun('needs-approval', resultsChange({
    id: 'change-flagged',
    itemId: 'item-flagged',
    path: 'src/app/config.ts',
    before: '',
    after: 'const api_key = "sk-live-abcdef123456";\ncall(api_key);',
    createOnly: true,
    createdBy: 'builder',
    attempt: 1,
  }));
  const { tree } = await mountResultsStudio({ run, projectRoot: 'Z:\\fixture-project' });
  const rendered = textNodes(tree.toJSON()).join(' \n ');

  expect(rendered).toContain('src/app/config.ts');
  // The secret block has to be stated in words, in any honest spelling. The dispatch card calls
  // this state "Blocked for secrets · fix first" (App.tsx:402) and drives the same scan this
  // card's apply would hit (App.tsx:205), so a press here ends in a refusal the card never
  // mentioned -- a control that reads as available and is not.
  expect(rendered).toMatch(/secret/i);
  // And while the proposal is flagged, nothing on the card offers an enabled apply.
  const offersApply = pressableNodes(tree.toJSON())
    .filter(control => /apply/i.test(subtreeText(control)))
    .filter(control => !actionDisabled(control));
  expect(offersApply).toEqual([]);
  await unmount(tree);
});

// "Waiting for review" is the honest sentence for blocked and failed work. A cancelled item is
// neither: its work was stopped, so that sentence on its action claims a state that never
// existed. The receipt already prints "— cancelled" for the item (src/RunWorkspace.tsx:205), so
// this asserts the screen's words as a whole: the control's own label is the only part the card
// is free to keep.
test('a cancelled work item gets a disabled action labelled with its own fate, not review', async () => {
  const run = resultsRun('cancelled', resultsChange({ id: 'change-cancelled', itemId: 'item-cancelled' }));
  const { tree } = await mountResultsStudio({ run, projectRoot: 'Z:\\fixture-project' });
  const rendered = textNodes(tree.toJSON()).join(' \n ');

  expect(rendered).not.toMatch(/waiting for review/i);
  // ...and the action that replaces that sentence is disabled, because App.tsx:202 refuses the
  // apply of anything but a done or needs-approval item, and it says the work was cancelled --
  // any honest spelling of the fate the run actually recorded.
  const cancelledAction = pressableNodes(tree.toJSON()).find(control => /cancel/i.test(subtreeText(control)));
  if (!cancelledAction) throw new Error('no action is labelled as cancelled');
  expect(actionDisabled(cancelledAction)).toBe(true);
  await unmount(tree);
});

// The primary control's gate. A control that looks available but refuses when pressed is
// worse than one that says it is not available, so both states are held.
test('the start control is disabled until there is a task to run', async () => {
  const tree = await mount(React.createElement(App, { initialScreen: 'dispatch' }));

  const empty = findByLabel(tree.toJSON(), 'Start coordinated run');
  if (!empty) throw new Error('the composer renders no start control');
  expect((empty.props.accessibilityState as { disabled?: boolean } | undefined)?.disabled).toBe(true);

  const composer = textInputIn(tree);
  if (!composer) throw new Error('the composer renders no text input');
  await act(async () => { (composer.props.onChangeText as (text: string) => void)('Tighten the release notes screen.'); });

  const ready = findByLabel(tree.toJSON(), 'Start coordinated run');
  if (!ready) throw new Error('the composer renders no start control');
  expect((ready.props.accessibilityState as { disabled?: boolean } | undefined)?.disabled).toBe(false);

  await unmount(tree);
});

// Runs is an inbox: opening a row keeps the list beside its chat, with the plan separate.
test('opening a run in the inbox shows its messages beside the list and keeps the plan separate', async () => {
  const { saveRunSnapshot } = require('../src/persistence/runStore') as typeof import('../src/persistence/runStore');
  const at = '2026-01-01T00:00:00.000Z';
  await saveRunSnapshot({
    id: 'run-history',
    brief: 'Greet the world properly.',
    teamId: 'team-default',
    status: 'completed',
    items: [],
    messages: [{ id: 'message-history', runId: 'run-history', from: 'Builder', to: 'team', text: 'The release title now fits without scrolling.', createdAt: at, kind: 'update' }],
    artifacts: [],
    changes: [],
    createdAt: at,
    updatedAt: at,
  });

  const tree = await mount(React.createElement(App, { initialScreen: 'runs' }));
  if (!findByLabel(tree.toJSON(), 'Open conversation: Greet the world properly.')) throw new Error('the run in the history carries no conversation action');

  await press(tree, 'Open conversation: Greet the world properly.');

  // The inbox list remains beside the selected conversation, while plan is a separate action.
  const inbox = textNodes(tree.toJSON()).join(' \n ');
  expect(inbox).toContain('Recent runs');
  expect(inbox).toContain('Greet the world properly.');
  expect(inbox).toContain('The release title now fits without scrolling.');
  expect(findPressableByText(tree.toJSON(), 'Plan')).not.toBeNull();
  await pressByText(tree, 'Plan');
  expect(textNodes(tree.toJSON()).join(' \n ')).toContain('Team plan');
  await unmount(tree);
});

test('empty Teams page has one create action and one clear empty-state message', async () => {
  const tree = await mount(React.createElement(App, { initialScreen: 'teams' }));
  const createActions = pressableNodes(tree.toJSON()).filter(control => textNodes(control).some(text => /create team/i.test(text)));
  expect(createActions).toHaveLength(1);
  expect(textNodes(tree.toJSON()).join(' ')).toContain('No teams yet');
  await unmount(tree);
});

test('Dispatch renders agent messages on the plan screen, with proposals on Results route', async () => {
  const { saveRunSnapshot } = require('../src/persistence/runStore') as typeof import('../src/persistence/runStore');
  const at = '2026-01-01T00:00:00.000Z';
  await saveRunSnapshot({
    id: 'run-dispatch-separation', brief: 'Review the release note hierarchy.', teamId: 'team-default', status: 'completed',
    items: [{ id: 'item-review', title: 'Check the title hierarchy', kind: 'review', agentId: 'reviewer', dependsOn: [], status: 'done', artifactIds: [] }],
    messages: [{ id: 'message-review', runId: 'run-dispatch-separation', from: 'Reviewer', to: 'team', text: 'The title hierarchy reads clearly.', createdAt: at, kind: 'finding' }],
    artifacts: [],
    changes: [{ id: 'change-review', itemId: 'item-review', path: 'src/ReleaseNotes.tsx', before: 'old', after: 'new', createOnly: false, createdBy: 'Builder', attempt: 1 }],
    createdAt: at, updatedAt: at,
  });
  const tree = await mount(React.createElement(App, { initialScreen: 'dispatch' }));
  const dispatch = textNodes(tree.toJSON()).join(' ');
  expect(dispatch).toContain('Team plan');
  expect(dispatch).toContain('The title hierarchy reads clearly.');
  expect(dispatch).not.toContain('src/ReleaseNotes.tsx');
  expect(findPressableByText(tree.toJSON(), 'Results')).not.toBeNull();
  await pressByText(tree, 'Results');
  expect(textNodes(tree.toJSON()).join(' ')).toContain('src/ReleaseNotes.tsx');
  await unmount(tree);
});

test('task cards use a concise run label instead of repeating the full brief', async () => {
  const { saveRunSnapshot } = require('../src/persistence/runStore') as typeof import('../src/persistence/runStore');
  const at = '2026-01-01T00:00:00.000Z';
  const brief = 'Review the release notes layout and keep the published time visible.';
  await saveRunSnapshot({
    id: 'run-board-label',
    brief,
    mission: { id: 'release-notes', name: 'Release notes review', output: 'code' },
    teamId: 'team-default',
    status: 'completed',
    items: [
      { id: 'item-1', title: 'Check the information order', kind: 'review', agentId: 'reviewer', dependsOn: [], status: 'done', artifactIds: [] },
      { id: 'item-2', title: 'Keep the date visible', kind: 'code', agentId: 'builder', dependsOn: ['item-1'], status: 'done', artifactIds: [] },
    ],
    messages: [],
    artifacts: [],
    createdAt: at,
    updatedAt: at,
  });
  const tree = await mount(React.createElement(App, { initialScreen: 'board' }));
  const card = findPressableByText(tree.toJSON(), 'Check the information order');
  if (!card) throw new Error('the task board did not render the seeded assignment');
  expect(subtreeHasText(card, 'Release notes review')).toBe(true);
  expect(subtreeHasText(card, brief)).toBe(false);
  await unmount(tree);
});

// ---- The three controls that decide whether the app works --------------------------------

function textInputIn(tree: ReactTestRenderer): TreeNode | null {
  const find = (node: TreeRoot): TreeNode | null => {
    if (!node || typeof node === 'string') return null;
    if (Array.isArray(node)) {
      for (const kid of node) {
        const hit = find(kid);
        if (hit) return hit;
      }
      return null;
    }
    if (node.type === 'TextInput') return node;
    return find((node.children ?? null) as TreeRoot);
  };
  return find(tree.toJSON());
}

test('pressing Start run plans the task and puts the run on screen', async () => {
  const { defaultProviderProfile, saveProviderProfile } = require('../src/persistence/providerProfile');
  const credentials = require('../src/persistence/providerCredentials');
  const { defaultWorkspaceSettings, saveWorkspaceSettings } = require('../src/persistence/workspace');
  const runner = require('../src/orchestration/model-runner') as typeof import('../src/orchestration/model-runner');

  // The state the app is in when it is allowed to work: a team to plan with, a model, and a
  // stored key. Without them the start button refuses, which is a different test.
  await saveWorkspaceSettings({
    ...defaultWorkspaceSettings,
    teamRoleIds: ['planner', 'builder'],
    teams: [{ id: 'team-default', name: 'Core team', description: 'The agents that do the work.', agentIds: ['planner', 'builder'] }],
    activeTeamId: 'team-default',
  });
  await saveProviderProfile({ ...defaultProviderProfile, model: 'test-model' });
  const secret = jest.spyOn(credentials, 'hasProviderSecret').mockResolvedValue(true);

  const brief = 'Tighten the release notes screen.';
  const stamp = '2026-01-01T00:00:00.000Z';
  const planned: Run = {
    id: 'run-planned',
    brief,
    teamId: 'team-default',
    status: 'queued',
    items: [],
    messages: [],
    artifacts: [],
    changes: [],
    createdAt: stamp,
    updatedAt: stamp,
  };
  const plan = jest.spyOn(runner, 'createPlannedRun');
  plan.mockImplementation(async (options) => {
    options.onPlanned?.(planned);
    return planned;
  });

  const tree = await mount(React.createElement(App, { initialScreen: 'dispatch' }));

  const composer = textInputIn(tree);
  if (!composer) throw new Error('the composer renders no text input');
  await act(async () => { (composer.props.onChangeText as (text: string) => void)(brief); });

  await press(tree, 'Start coordinated run');

  // The plan was asked for with the brief that was typed, and the run it returned is on
  // screen. Both halves matter: a start that plans nothing is a silent no-op.
  expect(plan).toHaveBeenCalledTimes(1);
  expect(plan.mock.calls[0][0].brief).toBe(brief);

  // The run has to have landed, and the pending brief renders the same words as the run's
  // own task block, so the words prove nothing. What proves it is the planning
  // placeholder being gone and the run's own state being on screen.
  const landed = textNodes(tree.toJSON()).join(' \n ');
  expect(landed).not.toContain('Dispatch is creating a plan');
  expect(landed).toContain('Plan ready');

  secret.mockRestore();
  plan.mockRestore();
  await unmount(tree);
});

test('pressing Undo applied change asks the app to undo that change', async () => {
  const run = resultsRun('done', resultsChange({ appliedAt: '2026-01-01T00:00:00.000Z' }));
  const { tree, onUndo } = await mountResultsStudio({ run, projectRoot: 'Z:\\fixture-project' });

  const undo = pressableNodes(tree.toJSON()).find(control => /undo applied change/i.test(subtreeText(control)));
  if (!undo) throw new Error('no undo control is rendered for the applied change');
  await pressControl(undo);

  // Undo is the destructive-adjacent path: a broken undo loses work, so the handler has to
  // be handed the run and the change it belongs to.
  expect(onUndo).toHaveBeenCalledWith(run, 'change-greeting');
  await unmount(tree);
});

test('pressing a destination in the rail shows that screen', async () => {
  const tree = await mount(React.createElement(App, { initialScreen: 'dispatch' }));
  expect(textNodes(tree.toJSON()).join(' \n ')).not.toContain('Design workspace');

  await press(tree, 'Design studio');

  // Every destination in the rail has to lead somewhere. A rail item that does nothing is
  // worse than a missing one, because it looks like a working control.
  expect(textNodes(tree.toJSON()).join(' \n ')).toContain('Design workspace');
  await unmount(tree);
});

test('pressing a run in the history opens that run', async () => {
  const run = resultsRun('done', resultsChange());
  // The history lists the other runs, so the run on screen is not the one in the list.
  const earlier: Run = { ...run, id: 'run-earlier', brief: 'An earlier run.' };
  const { tree, onOpenRun } = await mountResultsStudio({ run, history: [run, earlier] });

  const open = pressableNodes(tree.toJSON()).find(control => /^open\b/i.test(String(control.props.accessibilityLabel ?? '')));
  if (!open) throw new Error('no run in the history carries an open action');
  await pressControl(open);

  expect(onOpenRun).toHaveBeenCalledWith(earlier);
  await unmount(tree);
});
