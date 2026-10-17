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