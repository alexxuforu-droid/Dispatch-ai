/**
 * Bounded storage.
 *
 * The defect under test: the event log, the usage ledger, the model catalog and the image
 * cache all grew without a limit, and an append rewrote everything that came before it.
 *
 * The rules held here:
 *  - an event append touches one run's storage, never another run's;
 *  - a run keeps a bounded number of events, and a terminal event is never dropped;
 *  - the usage ledger keeps the recent rows and folds the old ones into a summary;
 *  - the catalog list and the image cache are capped;
 *  - the stored run snapshot is bounded, and an oversized change payload is recorded as
 *    elided rather than silently truncated into something that looks valid.
 */

jest.mock('@react-native-async-storage/async-storage', () => require('./asyncStorageMock').asyncStorageMock);

import { resetAsyncStorageMock, storageBacking } from './asyncStorageMock';
import { readUsage, readUsageSummary, recordUsage, USAGE_RETENTION_MS } from '../src/persistence/usageLedger';
import { readCatalogSnapshot, saveCatalogSnapshot, MAX_CATALOG_IDS } from '../src/persistence/modelCatalogStore';
import { clearGeneratedImages, forgetGeneratedImage, MAX_CACHED_IMAGES, readGeneratedImage, rememberGeneratedImage } from '../src/persistence/generatedImageCache';
import { EVENT_SEGMENT_SIZE, ELIDED_CHANGE_PAYLOAD, isChangePayloadElided, isTerminalEvent, loadRunHistory, MAX_EVENTS_PER_RUN, PersistentRunEventStore, saveRunSnapshot } from '../src/persistence/runStore';
import type { Run } from '../src/orchestration/types';

const ENDPOINT = 'https://api.openai.com/v1';

const makeRun = (id: string, changes: Run['changes'] = []): Run => ({
  id,
  brief: 'ship the slice',
  status: 'completed',
  teamId: 'team',
  items: [],
  messages: [],
  artifacts: [],
  changes,
  createdAt: '2026-10-17T00:00:00.000Z',
  updatedAt: '2026-10-17T00:00:00.000Z',
});

const usageRow = (at: number) => ({
  runId: null,
  agentId: 'builder',
  model: 'gpt-4o',
  promptTokens: 10,
  completionTokens: 5,
  totalTokens: 15,
  basis: 'exact' as const,
  phase: 'run' as const,
  at,
});

afterEach(() => {
  resetAsyncStorageMock();
  clearGeneratedImages();
});

describe('the event log is stored per run', () => {
  test('an append writes one run, never the history of another run', async () => {
    const AsyncStorage = jest.requireMock('@react-native-async-storage/async-storage').default;
    const store = new PersistentRunEventStore();
    await store.append({ runId: 'run-a', type: 'run.created', payload: {}, at: '2026-10-17T00:00:00.000Z' });
    const spy = jest.spyOn(AsyncStorage, 'setItem');
    await store.append({ runId: 'run-b', type: 'run.created', payload: {}, at: '2026-10-17T00:00:01.000Z' });
    const touched = spy.mock.calls.map(call => String(call[0]));
    spy.mockRestore();
    expect(touched.length).toBeGreaterThan(0);
    expect(touched.every(key => key.includes('run-b'))).toBe(true);
  });

  test('each run has its own event segment on disk', async () => {
    const store = new PersistentRunEventStore();
    await store.append({ runId: 'run-a', type: 'run.created', payload: {}, at: '2026-10-17T00:00:00.000Z' });
    await store.append({ runId: 'run-b', type: 'run.created', payload: {}, at: '2026-10-17T00:00:01.000Z' });
    expect(storageBacking.has('dispatch.run.run-a.events.v1.0')).toBe(true);
    expect(storageBacking.has('dispatch.run.run-b.events.v1.0')).toBe(true);
  });

  test('the legacy single-array log of an older install still loads and is migrated', async () => {
    storageBacking.set('dispatch.run.run-old.events.v1', JSON.stringify([
      { seq: 1, runId: 'run-old', at: '2026-10-17T00:00:00.000Z', type: 'run.created', payload: {} },
      { seq: 2, runId: 'run-old', at: '2026-10-17T00:00:01.000Z', type: 'run.status', payload: { status: 'completed' } },
    ]));
    const store = new PersistentRunEventStore();
    const events = await store.read('run-old');
    expect(events.map(event => event.seq)).toEqual([1, 2]);
    const appended = await store.append({ runId: 'run-old', type: 'agent.message', payload: {}, at: '2026-10-17T00:00:02.000Z' });
    expect(appended.seq).toBe(3);
    expect(storageBacking.has('dispatch.run.run-old.events.v1')).toBe(false);
  });
});

describe('the event log of a run is bounded', () => {
  test('a run keeps at most the retention window of events', async () => {
    const store = new PersistentRunEventStore();
    for (let index = 0; index < MAX_EVENTS_PER_RUN + 120; index += 1) {
      await store.append({ runId: 'run-big', type: 'work.started', payload: { index }, at: '2026-10-17T00:00:00.000Z' });
    }
    const events = await store.read('run-big');
    expect(events.length).toBeLessThanOrEqual(MAX_EVENTS_PER_RUN + EVENT_SEGMENT_SIZE);
  });

  test('a terminal event is never dropped by the retention rule', async () => {
    const store = new PersistentRunEventStore();
    await store.append({ runId: 'run-done', type: 'run.status', payload: { status: 'completed' }, at: '2026-10-17T00:00:00.000Z' });
    for (let index = 0; index < MAX_EVENTS_PER_RUN + 120; index += 1) {
      await store.append({ runId: 'run-done', type: 'work.started', payload: { index }, at: '2026-10-17T00:00:00.000Z' });
    }
    const events = await store.read('run-done');
    expect(events.some(event => isTerminalEvent(event))).toBe(true);
    expect(events.filter(event => event.type === 'run.status')).toHaveLength(1);
  });

  test('the sequence keeps counting up after old events are dropped', async () => {
    const store = new PersistentRunEventStore();
    for (let index = 0; index < MAX_EVENTS_PER_RUN + 10; index += 1) {
      await store.append({ runId: 'run-seq', type: 'work.started', payload: { index }, at: '2026-10-17T00:00:00.000Z' });
    }
    const appended = await store.append({ runId: 'run-seq', type: 'agent.message', payload: {}, at: '2026-10-17T00:00:00.000Z' });
    expect(appended.seq).toBe(MAX_EVENTS_PER_RUN + 11);
  });
});

describe('the usage ledger is bounded', () => {
  test('rows older than the retention window are folded into the summary', async () => {
    const now = Date.now();
    await recordUsage(usageRow(now - USAGE_RETENTION_MS - 60_000));
    await recordUsage(usageRow(now));
    const rows = await readUsage();
    expect(rows).toHaveLength(1);
    expect(rows[0].at).toBe(now);
    const summary = await readUsageSummary();
    expect(summary.callCount).toBe(1);
    expect(summary.exact).toBe(15);
  });

  test('the retention rule is a visible constant', () => {
    expect(USAGE_RETENTION_MS).toBe(30 * 24 * 60 * 60 * 1000);
  });
});

describe('the model catalog is bounded', () => {
  test('the stored id list is capped', async () => {
    const ids = Array.from({ length: 2_000 }, (_, index) => `model-${index}`);
    await saveCatalogSnapshot(ENDPOINT, ids, Date.now());
    const snapshot = await readCatalogSnapshot(ENDPOINT);
    expect(snapshot?.ids).toHaveLength(MAX_CATALOG_IDS);
    expect(MAX_CATALOG_IDS).toBe(500);
  });
});

describe('the image cache is bounded', () => {
  test('the oldest image is evicted when the cache is full', () => {
    for (let index = 0; index < MAX_CACHED_IMAGES + 4; index += 1) rememberGeneratedImage(`uri-${index}`, `pixels-${index}`);
    expect(readGeneratedImage('uri-0')).toBeUndefined();
    expect(readGeneratedImage(`uri-${MAX_CACHED_IMAGES + 3}`)).toBe(`pixels-${MAX_CACHED_IMAGES + 3}`);
  });

  test('forgetting an image keeps the cache accounting straight', () => {
    rememberGeneratedImage('uri-a', 'pixels-a');
    forgetGeneratedImage('uri-a');
    expect(readGeneratedImage('uri-a')).toBeUndefined();
    rememberGeneratedImage('uri-b', 'pixels-b');
    expect(readGeneratedImage('uri-b')).toBe('pixels-b');
  });
});

describe('the stored run snapshot is bounded', () => {
  test('an oversized change payload is elided and the elision is recorded', async () => {
    const huge = 'x'.repeat(200_000);
    await saveRunSnapshot(makeRun('run-huge', [{ id: 'change-1', itemId: 'item-1', path: 'src/a.ts', before: huge, after: huge, createOnly: false, createdBy: 'builder', attempt: 1 }]));
    const history = await loadRunHistory();
    const change = history[0].changes?.[0];
    expect(change?.before).toBe(ELIDED_CHANGE_PAYLOAD);
    expect(change?.after).toBe(ELIDED_CHANGE_PAYLOAD);
    expect(isChangePayloadElided(change)).toBe(true);
  });

  test('an ordinary change keeps its payload', async () => {
    await saveRunSnapshot(makeRun('run-small', [{ id: 'change-1', itemId: 'item-1', path: 'src/a.ts', before: 'before', after: 'after', createOnly: false, createdBy: 'builder', attempt: 1 }]));
    const history = await loadRunHistory();
    const change = history[0].changes?.[0];
    expect(change?.before).toBe('before');
    expect(change?.after).toBe('after');
    expect(isChangePayloadElided(change)).toBe(false);
  });
});
