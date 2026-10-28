/**
 * Corruption handling for the storage layer.
 *
 * The defect under test: a truncated value used to throw out of every later write, so one
 * broken blob wedged the app for good, and a corrupt settings blob was replaced by defaults
 * that the app then saved back over the original.
 *
 * The rules held here:
 *  - a parse failure never escapes as a throw;
 *  - the unreadable value is kept aside under a quarantine key before anything overwrites it;
 *  - the caller is told "first run" apart from "corrupt and quarantined";
 *  - a corrupt run history can be moved aside without destroying it.
 */

jest.mock('@react-native-async-storage/async-storage', () => require('./asyncStorageMock').asyncStorageMock);

import { resetAsyncStorageMock, storageBacking } from './asyncStorageMock';
import type { StorageRead } from '../src/persistence/storageSafety';
import { defaultWorkspaceSettings, loadWorkspaceSettings, loadWorkspaceSettingsResult, saveWorkspaceSettings } from '../src/persistence/workspace';
import { defaultProviderProfile, loadProviderProfile, loadProviderProfileResult, saveProviderProfile } from '../src/persistence/providerProfile';
import { readUsage, readUsageResult, recordUsage } from '../src/persistence/usageLedger';
import { readAll, readAllResult, readCatalogSnapshot, saveCatalogSnapshot } from '../src/persistence/modelCatalogStore';
import { discardRunHistory, loadRunHistory, loadRunHistoryResult, PersistentRunEventStore, quarantineRunHistory, saveRunSnapshot } from '../src/persistence/runStore';
import type { Run } from '../src/orchestration/types';

const SETTINGS_KEY = 'dispatch.workspace.settings.v1';
const PROFILE_KEY = 'dispatch.provider.profile.v1';
const USAGE_KEY = 'dispatch.usage.v1';
const CATALOG_KEY = 'dispatch.catalog.v1';
const RUN_INDEX = 'dispatch.runs.index.v1';

const makeRun = (id: string): Run => ({
  id,
  brief: 'ship the slice',
  status: 'completed',
  teamId: 'team',
  items: [],
  messages: [],
  artifacts: [],
  createdAt: '2026-10-17T00:00:00.000Z',
  updatedAt: '2026-10-17T00:00:00.000Z',
});

const quarantineKeys = (key: string) => [...storageBacking.keys()].filter(candidate => candidate.startsWith(`${key}.corrupt.`));

/** Asserts that a read came back corrupt and narrows the result so the key can be read. */
function corruptRead<T>(result: StorageRead<T>): Extract<StorageRead<T>, { status: 'corrupt' }> {
  if (result.status !== 'corrupt') throw new Error(`expected a corrupt read, got ${result.status}`);
  return result;
}

afterEach(() => { resetAsyncStorageMock(); });

describe('workspace settings survive a corrupt blob', () => {
  test('a corrupt blob is quarantined and reported, not silently turned into defaults', async () => {
    storageBacking.set(SETTINGS_KEY, '{"version":4,"teams":[{"id":"team-a"');
    const result = corruptRead(await loadWorkspaceSettingsResult());
    expect(result.quarantineKey).toContain(`${SETTINGS_KEY}.corrupt.`);
    expect(storageBacking.get(result.quarantineKey)).toBe('{"version":4,"teams":[{"id":"team-a"');
  });

  test('the auto-save that follows a corrupt load cannot destroy the quarantined settings', async () => {
    const corrupt = '{"version":4,"teams":[{"id":"team-a"';
    storageBacking.set(SETTINGS_KEY, corrupt);
    await loadWorkspaceSettings();
    await saveWorkspaceSettings({ ...defaultWorkspaceSettings, teams: [{ id: 'team-b', name: 'B', description: '', agentIds: [] }] });
    const backups = quarantineKeys(SETTINGS_KEY);
    expect(backups).toHaveLength(1);
    expect(storageBacking.get(backups[0])).toBe(corrupt);
  });

  test('an empty slot is a first run, not a corruption', async () => {
    const result = await loadWorkspaceSettingsResult();
    expect(result.status).toBe('empty');
    expect(result.value).toEqual(defaultWorkspaceSettings);
  });

  test('a settings blob of an unknown version is kept aside instead of being overwritten', async () => {
    storageBacking.set(SETTINGS_KEY, JSON.stringify({ version: 99, teams: [{ id: 'team-a' }] }));
    const result = corruptRead(await loadWorkspaceSettingsResult());
    expect(storageBacking.get(result.quarantineKey)).toContain('team-a');
  });
});

describe('the provider profile survives a corrupt blob', () => {
  test('a corrupt profile is quarantined and the defaults are returned', async () => {
    storageBacking.set(PROFILE_KEY, 'not-json');
    const result = corruptRead(await loadProviderProfileResult());
    expect(result.value).toEqual(defaultProviderProfile);
    expect(storageBacking.get(result.quarantineKey)).toBe('not-json');
  });

  test('saving a profile after a corrupt read keeps the unreadable value aside', async () => {
    storageBacking.set(PROFILE_KEY, 'not-json');
    await loadProviderProfile();
    await saveProviderProfile({ endpoint: 'https://api.openai.com/v1', model: 'gpt-4o', imageModel: '' });
    expect(quarantineKeys(PROFILE_KEY)).toHaveLength(1);
    expect((await loadProviderProfile()).model).toBe('gpt-4o');
  });
});

describe('the usage ledger survives a corrupt blob', () => {
  test('a corrupt ledger is quarantined and reported', async () => {
    storageBacking.set(USAGE_KEY, '[{"runId":null,');
    const result = corruptRead(await readUsageResult());
    expect(result.quarantineKey).toContain(`${USAGE_KEY}.corrupt.`);
    expect(storageBacking.get(result.quarantineKey)).toBe('[{"runId":null,');
  });

  test('a corrupt ledger does not wedge every later row', async () => {
    storageBacking.set(USAGE_KEY, '[{"runId":null,');
    await recordUsage({ runId: null, agentId: 'a', model: 'm', promptTokens: 1, completionTokens: 1, totalTokens: 2, basis: 'exact', phase: 'run' });
    const rows = await readUsage();
    expect(rows).toHaveLength(1);
    expect(rows[0].totalTokens).toBe(2);
    expect(quarantineKeys(USAGE_KEY)).toHaveLength(1);
  });

  test('a corrupt read resolves with no rows and reports the corruption', async () => {
    storageBacking.set(USAGE_KEY, 'not-json');
    const result = await readUsageResult();
    expect(result.status).toBe('corrupt');
    expect(result.value).toEqual([]);
    await expect(readUsage()).resolves.toEqual([]);
  });
});

describe('the model catalog survives a corrupt blob', () => {
  test('a corrupt catalog is quarantined and the suggestions are empty, not fatal', async () => {
    storageBacking.set(CATALOG_KEY, '{not json at all');
    const result = corruptRead(await readAllResult());
    expect(result.value).toEqual({});
    expect(storageBacking.get(result.quarantineKey)).toBe('{not json at all');
    await expect(readAll()).resolves.toEqual({});
  });

  test('a new snapshot can be written after the corrupt one was quarantined', async () => {
    storageBacking.set(CATALOG_KEY, '{not json at all');
    await readAll();
    await saveCatalogSnapshot('https://api.openai.com/v1', ['a-model'], 1);
    expect((await readCatalogSnapshot('https://api.openai.com/v1'))?.ids).toEqual(['a-model']);
    expect(quarantineKeys(CATALOG_KEY)).toHaveLength(1);
  });
});

describe('the run store survives a corrupt blob', () => {
  test('a corrupt run index is quarantined and the history reads empty', async () => {
    storageBacking.set(RUN_INDEX, 'not-json');
    const result = corruptRead(await loadRunHistoryResult());
    expect(result.value).toEqual([]);
    expect(storageBacking.get(result.quarantineKey)).toBe('not-json');
  });

  test('a corrupt snapshot is quarantined and the other runs still load', async () => {
    await saveRunSnapshot(makeRun('run-good'));
    storageBacking.set(RUN_INDEX, JSON.stringify(['run-good', 'run-bad']));
    storageBacking.set('dispatch.run.run-bad.snapshot.v1', 'not-json');
    const result = corruptRead(await loadRunHistoryResult());
    expect(result.value.map(run => run.id)).toEqual(['run-good']);
    expect(storageBacking.get(result.quarantineKey)).toBe('not-json');
  });

  test('a corrupt event log does not stop the next append', async () => {
    storageBacking.set('dispatch.run.run-1.events.v1', '{not json');
    const store = new PersistentRunEventStore();
    const saved = await store.append({ runId: 'run-1', type: 'run.created', payload: {}, at: '2026-10-17T00:00:00.000Z' });
    expect(saved.seq).toBe(1);
    await expect(store.read('run-1')).resolves.toHaveLength(1);
    expect(quarantineKeys('dispatch.run.run-1.events.v1')).toHaveLength(1);
  });
});

describe('the run history can be moved aside without being destroyed', () => {
  test('quarantineRunHistory keeps a copy and empties the live history', async () => {
    await saveRunSnapshot(makeRun('run-1'));
    const { quarantineKey, runs } = await quarantineRunHistory();
    expect(runs).toBe(1);
    const manifest = JSON.parse(storageBacking.get(quarantineKey)!);
    expect(manifest.runs).toEqual(['run-1']);
    const snapshotKey = manifest.keys.find((key: string) => key.startsWith('dispatch.run.run-1.snapshot.v1'));
    expect(JSON.parse(storageBacking.get(snapshotKey)!).id).toBe('run-1');
    await expect(loadRunHistory()).resolves.toEqual([]);
  });

  test('discardRunHistory also keeps a copy: a readable history is never destroyed', async () => {
    await saveRunSnapshot(makeRun('run-1'));
    await discardRunHistory();
    await expect(loadRunHistory()).resolves.toEqual([]);
    const backups = [...storageBacking.keys()].filter(key => key.includes('.quarantine.'));
    expect(backups.length).toBeGreaterThan(0);
    expect(storageBacking.get(backups.find(key => key.startsWith('dispatch.run.run-1.snapshot.v1'))!)).toContain('run-1');
  });
});
