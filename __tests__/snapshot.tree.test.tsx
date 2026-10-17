import React, { act } from 'react';
import renderer, { ReactTestRenderer } from 'react-test-renderer';

// Dev-only tree dumper. Uses require() rather than a node-typed import so the repo stays
// free of an @types/node dependency just to render a snapshot. No local declaration of
// `require`: jest hoists mock factories above module scope, so a local shadow would make
// the shared-factory call below an illegal out-of-scope reference.
const fs = require('fs');
const path = require('path');

jest.mock('@react-native-async-storage/async-storage', () => require('./asyncStorageMock').asyncStorageMock);

jest.mock('react-native-safe-area-context', () => {
  const ReactActual = require('react');
  const { View } = require('react-native');
  return {
    SafeAreaProvider: ({ children }: { children: React.ReactNode }) => ReactActual.createElement(View, null, children),
    SafeAreaView: ({ children }: { children: React.ReactNode }) => ReactActual.createElement(View, null, children),
    useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }),
  };
});

let mockWidth = 1440;
let mockHeight = 900;

// Dimensions.set() does not reach useWindowDimensions under the jest preset, so the two
// narrow captures came out byte-identical. Mock the hook itself, otherwise every
// responsive claim made from these renders is fabricated.
jest.mock('react-native/Libraries/Utilities/useWindowDimensions', () => ({
  __esModule: true,
  default: () => ({ width: mockWidth, height: mockHeight, scale: 1, fontScale: 1 }),
}));

const OUT_DIR = 'C:\\Users\\Admin\\AppData\\Local\\Temp\\opencode\\snapshots';

function setViewport(width: number, height: number) {
  mockWidth = width;
  mockHeight = height;
}

async function snapshot(name: string, element: React.ReactElement): Promise<string> {
  let tree!: ReactTestRenderer;
  await act(async () => {
    tree = renderer.create(element);
  });
  fs.mkdirSync(OUT_DIR, { recursive: true });
  const json = JSON.stringify(tree.toJSON(), null, 1);
  fs.writeFileSync(path.join(OUT_DIR, `${name}.json`), json, 'utf8');
  await act(async () => { tree.unmount(); });
  return json;
}

const SCREENS = ['dispatch', 'teams', 'agents', 'runs', 'reviews', 'artifacts', 'board', 'workflows', 'plugins', 'design', 'settings'] as const;

test('capture every screen at desktop width', async () => {
  setViewport(1440, 900);
  const App = require('../App').default;
  const seen = new Map<string, string>();
  for (const screen of SCREENS) {
    await snapshot(`screen-${screen}-1440`, React.createElement(App, { initialScreen: screen }));
    const json = fs.readFileSync(path.join(OUT_DIR, `screen-${screen}-1440.json`), 'utf8');
    seen.set(screen, json);
    // Every screen must render real content, and each must be genuinely distinct from the
    // others. Identical trees would mean initialScreen is not reaching the switch at all.
    expect(json.length).toBeGreaterThan(5000);
  }
  const distinct = new Set(seen.values());
  expect(distinct.size).toBe(SCREENS.length);
}, 120000);

// The usage screen in its honest empty state, before anything has been spent.
test('capture the usage screen empty', async () => {
  setViewport(1440, 900);
  const { clearUsage } = require('../src/persistence/usageLedger');
  await clearUsage();
  const App = require('../App').default;
  const json = await snapshot('screen-usage-empty-1440', React.createElement(App, { initialScreen: 'usage' }));

  // A capture with no assertion proves nothing. An empty ledger must still render both
  // aggregates at zero, and must still carry the method statement.
  expect(json).toContain('Exact total');
  expect(json).toContain('Estimated total');
  expect(json).toContain('Every token your agents spend');
  expect(json).toContain('never added together');
}, 60000);

// Seeded through the real ledger write path, not injected into storage, so the capture
// exercises the same code a real run would.
test('capture the usage screen with a mixed exact and estimated ledger', async () => {
  setViewport(1440, 900);
  const { recordUsage, clearUsage } = require('../src/persistence/usageLedger');
  await clearUsage();
  const rows = [
    { runId: null, agentId: 'planner', model: 'stepfun-ai/step-5-preview', p: 8420, c: 612, basis: 'exact' },
    { runId: 'run-7f2a', agentId: 'planner', model: 'stepfun-ai/step-5-preview', p: 8104, c: 588, basis: 'exact' },
    { runId: 'run-7f2a', agentId: 'builder', model: 'stepfun-ai/step-5-preview', p: 15320, c: 2240, basis: 'exact' },
    { runId: 'run-7f2a', agentId: 'builder', model: 'stepfun-ai/step-5-preview', p: 9120, c: 1180, basis: 'exact' },
    { runId: 'run-7f2a', agentId: 'reviewer', model: 'stepfun-ai/step-5-preview', p: 22100, c: 940, basis: 'exact' },
    { runId: 'run-91bd', agentId: 'planner', model: 'stepfun-ai/step-5-preview', p: 7780, c: 502, basis: 'exact' },
    { runId: 'run-91bd', agentId: 'art-critic', model: 'openai/gpt-4o-mini', p: 41200, c: 640, basis: 'exact' },
    { runId: 'run-c40e', agentId: 'builder', model: 'local/llama-3.1-70b', p: 0, c: 0, basis: 'estimated', chars: 41200 },
    { runId: 'run-c40e', agentId: 'reviewer', model: 'local/llama-3.1-70b', p: 0, c: 0, basis: 'estimated', chars: 18400 },
    { runId: 'run-c40e', agentId: 'planner', model: 'local/llama-3.1-70b', p: 0, c: 0, basis: 'estimated', chars: 9650 },
  ];
  for (const row of rows) {
    const total = row.chars ? Math.ceil(row.chars / 4) : row.p + row.c;
    await recordUsage({
      runId: row.runId,
      agentId: row.agentId,
      model: row.model,
      promptTokens: row.chars ? Math.ceil(row.chars / 8) : row.p,
      completionTokens: total - (row.chars ? Math.ceil(row.chars / 8) : row.p),
      totalTokens: total,
      basis: row.basis,
      phase: row.runId ? 'run' : 'plan',
      at: Date.now() - rows.indexOf(row) * 3600_000,
    });
  }
  const App = require('../App').default;
  const json = await snapshot('screen-usage-1440', React.createElement(App, { initialScreen: 'usage' }));

  // Seven exact rows summing to 118,746 shown verbatim, three estimates summing to 17,313
  // rounded to two significant digits and tagged. The comment above this test claims the
  // ledger exercises the same write path a real run would; these assertions are what make
  // that claim checkable rather than decorative.
  expect(json).toContain('Exact total');
  expect(json).toContain('118,746');
  expect(json).toContain('Estimated total');
  expect(json).toContain('\u2248 17,000 (est.)');
  // Still no grand total anywhere in the rendered tree.
  expect(json).not.toContain('136,059');
  expect(json).not.toContain('136059');
}, 60000);

// Settings with a stale model catalog: suggestions must be gone, the "last checked" note
// must be present, and the free-text model field must be untouched and enabled.
test('capture settings with a stale model catalog', async () => {
  setViewport(1440, 900);
  const { providerModelCatalog } = require('../src/providers/openai-compatible');
  const { saveCatalogSnapshot, clearCatalogSnapshot } = require('../src/persistence/modelCatalogStore');
  const { saveProviderProfile, defaultProviderProfile } = require('../src/persistence/providerProfile');
  await clearCatalogSnapshot();
  providerModelCatalog.forget('https://api.openai.com/v1');
  await saveProviderProfile({ ...defaultProviderProfile, endpoint: 'https://api.openai.com/v1', model: 'vendor::tuned/model-2027-01-01', imageModel: '' });
  // Recorded well past the 10 minute TTL, so the listing is stale.
  providerModelCatalog.record('https://api.openai.com/v1', ['stale-a', 'stale-b'], Date.now() - 42 * 60 * 1000);
  await saveCatalogSnapshot('https://api.openai.com/v1', ['stale-a', 'stale-b'], Date.now() - 42 * 60 * 1000);
  const App = require('../App').default;
  const json = await snapshot('screen-settings-stale-1440', React.createElement(App, { initialScreen: 'settings' }));

  // Three claims, three assertions. Previously this test only wrote a file, so the comment
  // above it was unbacked.
  // (a) the stale suggestions are not offered...
  expect(json).not.toContain('stale-a');
  expect(json).not.toContain('stale-b');
  // (b) the staleness is actually disclosed to the user, not just computed...
  expect(json).toContain('It may be out of date');
  // ...and the advisory framing is still there.
  expect(json).toContain('It only ever offers suggestions');
  // (c) ...and the saved id survives untouched, free text, nothing disabled.
  expect(json).toContain('vendor::tuned/model-2027-01-01');
  expect(json).not.toContain('"editable": false');
}, 60000);

test('capture the dispatch screen at narrow widths', async () => {
  const App = require('../App').default;
  for (const width of [320, 900]) {
    setViewport(width, 900);
    await snapshot(`screen-dispatch-${width}`, React.createElement(App, { initialScreen: 'dispatch' }));
  }
  expect(fs.existsSync(path.join(OUT_DIR, 'screen-dispatch-320.json'))).toBe(true);
}, 60000);

test('no fixed width exceeds the 320px viewport', async () => {
  // Renderer-independent evidence for the narrow-width requirement. This does not prove the
  // absence of overflow from flex arithmetic, but it does catch a hard-coded element that
  // could never fit, which is the failure a screenshot makes easy to misread.
  setViewport(320, 900);
  const App = require('../App').default;
  let tree!: ReactTestRenderer;
  await act(async () => { tree = renderer.create(React.createElement(App, { initialScreen: 'dispatch' })); });
  const offenders: string[] = [];
  const walk = (node: any, trail: string): void => {
    if (!node || typeof node === 'string') return;
    if (Array.isArray(node)) { node.forEach((child: any, index: number) => walk(child, `${trail}[${index}]`)); return; }
    const raw = node.props?.style;
    const style = Array.isArray(raw)
      ? raw.reduce((acc: Record<string, unknown>, s: unknown) => (s ? Object.assign(acc, s) : acc), {})
      : (raw ?? {});
    const width = style?.width;
    if (typeof width === 'number' && width > 320) offenders.push(`${node.type} width=${width}`);
    const children = Array.isArray(node.children) ? node.children : [];
    children.forEach((child: unknown, index: number) => walk(child, `${trail}/${node.type}[${index}]`));
  };
  walk(tree.toJSON(), '');
  expect(offenders).toEqual([]);
  await act(async () => { tree.unmount(); });
}, 60000);

test('narrow viewports actually change the tree', async () => {
  // Self-contained on purpose. An earlier version read captures written by the tests above
  // it, so a filtered or isolated run silently compared stale artifacts from a prior run.
  const App = require('../App').default;
  const capture = async (width: number) => {
    setViewport(width, 900);
    let rendered!: ReactTestRenderer;
    await act(async () => { rendered = renderer.create(React.createElement(App, { initialScreen: 'dispatch' })); });
    const json = JSON.stringify(rendered.toJSON());
    await act(async () => { rendered.unmount(); });
    return json;
  };
  const narrow = await capture(320);
  const medium = await capture(900);
  const desktop = await capture(1440);
  // 320 and 900 sit on the same side of the 1040 compact threshold, so they must match;
  // the meaningful proof is that a narrow viewport differs from the desktop layout.
  expect(narrow).toEqual(medium);
  expect(narrow).not.toEqual(desktop);
}, 60000);