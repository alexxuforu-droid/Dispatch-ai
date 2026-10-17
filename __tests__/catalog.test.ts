/**
 * Acid test for the model-catalog boundary condition.
 *
 * The catalog is a suggestion source and never an authority. This suite tries to make it
 * one, and asserts that every previously saved provider and model id still loads and still
 * sends no matter what happens to the cache or to the provider's /models listing.
 */

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
jest.mock('../src/persistence/providerCredentials', () => ({ loadProviderSecret: jest.fn(async () => 'test-key') }));

import {
  completeChat,
  fetchModelIds,
  ModelCatalogCache,
  providerModelCatalog,
  refreshModelCatalog,
} from '../src/providers/openai-compatible';
import { clearCatalogSnapshot, readCatalogSnapshot, rehydrateModelCatalog, saveCatalogSnapshot } from '../src/persistence/modelCatalogStore';
import { defaultProviderProfile, loadProviderProfile, saveProviderProfile } from '../src/persistence/providerProfile';
import { normalizeProviderEndpoint } from '../src/providers/openai-compatible';

const ENDPOINT = 'https://api.openai.com/v1';
const SAVED_MODEL = 'a-model-the-provider-never-listed';

function stubModels(models: string[], status = 200): void {
  (globalThis as { fetch?: unknown }).fetch = jest.fn(async () => ({
    ok: status >= 200 && status < 300,
    status,
    json: async () => ({ data: models.map(id => ({ id })) }),
  }));
}

// Captures what the provider was actually asked to run, which is the only thing that proves
// the saved id still SENDS rather than merely still being displayed.
function stubChat(): { bodies: { model: string }[] } {
  const bodies: { model: string }[] = [];
  (globalThis as { fetch?: unknown }).fetch = jest.fn(async (_url: string, init: { body: string }) => {
    bodies.push(JSON.parse(init.body));
    return { ok: true, status: 200, json: async () => ({ choices: [{ message: { content: 'ok' } }] }) };
  });
  return { bodies };
}

beforeEach(async () => {
  await clearCatalogSnapshot();
  providerModelCatalog.forget(ENDPOINT);
  await saveProviderProfile({ ...defaultProviderProfile, endpoint: ENDPOINT, model: SAVED_MODEL, imageModel: '' });
});

describe('the catalog is a suggestion source, never an authority', () => {
  test('a full catalog never rewrites the saved model id', async () => {
    stubModels(['some-other-model', 'yet-another']);
    await refreshModelCatalog({ ...defaultProviderProfile, endpoint: ENDPOINT, model: SAVED_MODEL, imageModel: '' });
    expect(providerModelCatalog.lookup(ENDPOINT)).toEqual(['some-other-model', 'yet-another']);
    expect((await loadProviderProfile()).model).toBe(SAVED_MODEL);
  });

  test('a refresh that omits the saved id still leaves it intact and sendable', async () => {
    stubModels(['only-this-one']);
    await refreshModelCatalog({ ...defaultProviderProfile, endpoint: ENDPOINT, model: SAVED_MODEL, imageModel: '' });
    expect(providerModelCatalog.lookup(ENDPOINT)).toEqual(['only-this-one']);
    expect(providerModelCatalog.lookup(ENDPOINT)).not.toContain(SAVED_MODEL);

    const { bodies } = stubChat();
    await completeChat({ ...defaultProviderProfile, endpoint: ENDPOINT, model: SAVED_MODEL, imageModel: '' }, [{ role: 'user', content: 'hi' }]);
    expect(bodies[0].model).toBe(SAVED_MODEL);
  });
});

describe('ACID TEST: delete the cache and the saved id must still load and send', () => {
  test('clearing the whole catalog cache changes nothing about the saved profile', async () => {
    stubModels(['a', 'b', 'c']);
    await refreshModelCatalog({ ...defaultProviderProfile, endpoint: ENDPOINT, model: SAVED_MODEL, imageModel: '' });
    await saveCatalogSnapshot(ENDPOINT, ['a', 'b', 'c'], Date.now());
    expect(await readCatalogSnapshot(ENDPOINT)).not.toBeNull();

    // Delete both halves: the durable artifact and the in-memory one.
    await clearCatalogSnapshot();
    providerModelCatalog.forget(ENDPOINT);

    expect(await readCatalogSnapshot(ENDPOINT)).toBeNull();
    expect(providerModelCatalog.lookup(ENDPOINT)).toEqual([]);

    const { bodies } = stubChat();
    const saved = await loadProviderProfile();
    expect(saved.model).toBe(SAVED_MODEL);
    await completeChat(saved, [{ role: 'user', content: 'go' }]);
    expect(bodies[0].model).toBe(SAVED_MODEL);
  });

  test('a provider returning an empty /models list still cannot un-save the model', async () => {
    stubModels([]);
    await refreshModelCatalog({ ...defaultProviderProfile, endpoint: ENDPOINT, model: SAVED_MODEL, imageModel: '' });
    expect(providerModelCatalog.lookup(ENDPOINT)).toEqual([]);

    const { bodies } = stubChat();
    const saved = await loadProviderProfile();
    expect(saved.model).toBe(SAVED_MODEL);
    await completeChat(saved, [{ role: 'user', content: 'go' }]);
    expect(bodies[0].model).toBe(SAVED_MODEL);
  });

  test('a provider that fails /models entirely still cannot un-save the model', async () => {
    stubModels([], 500);
    await expect(refreshModelCatalog({ ...defaultProviderProfile, endpoint: ENDPOINT, model: SAVED_MODEL, imageModel: '' })).rejects.toThrow();
    const { bodies } = stubChat();
    const saved = await loadProviderProfile();
    expect(saved.model).toBe(SAVED_MODEL);
    await completeChat(saved, [{ role: 'user', content: 'go' }]);
    expect(bodies[0].model).toBe(SAVED_MODEL);
  });

  test('a corrupt cache entry is ignored rather than fatal, and never touches the profile', async () => {
    const AsyncStorage = jest.requireMock('@react-native-async-storage/async-storage').default;
    await AsyncStorage.setItem('dispatch.catalog.v1', '{not json at all');
    const fresh = new ModelCatalogCache();
    await expect(rehydrateModelCatalog(fresh)).resolves.toBe(false);
    expect(fresh.lookup(ENDPOINT)).toEqual([]);

    const { bodies } = stubChat();
    const saved = await loadProviderProfile();
    expect(saved.model).toBe(SAVED_MODEL);
    await completeChat(saved, [{ role: 'user', content: 'go' }]);
    expect(bodies[0].model).toBe(SAVED_MODEL);
  });
});

describe('staleness is display metadata, never a validity signal', () => {
  test('freshness reports when, and never what', () => {
    const cache = new ModelCatalogCache(1000);
    expect(cache.freshness(ENDPOINT)).toEqual({ fetchedAt: null, stale: true });
    cache.record(ENDPOINT, ['a'], 10_000);
    expect(cache.freshness(ENDPOINT, 10_500)).toEqual({ fetchedAt: 10_000, stale: false });
    // Past the TTL the listing is gone, so no ids may leak out of freshness().
    expect(cache.freshness(ENDPOINT, 20_000)).toEqual({ fetchedAt: 10_000, stale: true });
    expect(Object.keys(cache.freshness(ENDPOINT, 20_000)).sort()).toEqual(['fetchedAt', 'stale']);
    expect(cache.lookup(ENDPOINT, 20_000)).toEqual([]);
  });

  test('a rehydrated stale cache still offers zero suggestions', async () => {
    const old = Date.now() - 60 * 60 * 1000;
    await saveCatalogSnapshot(ENDPOINT, ['stale-model'], old);
    const fresh = new ModelCatalogCache();
    await rehydrateModelCatalog(fresh);
    expect(fresh.freshness(ENDPOINT).stale).toBe(true);
    expect(fresh.lookup(ENDPOINT)).toEqual([]);
  });
});

describe('refresh does not gate anything', () => {
  test('fetchModelIds surfaces a provider failure to the caller rather than saving anything', async () => {
    stubModels([], 401);
    await expect(fetchModelIds({ ...defaultProviderProfile, endpoint: ENDPOINT, model: SAVED_MODEL, imageModel: '' }))
      .rejects.toThrow('The provider rejected this API key.');
    expect((await loadProviderProfile()).model).toBe(SAVED_MODEL);
  });

  test('the saved profile accepts any model string, catalog or not', async () => {
    const odd = { ...defaultProviderProfile, endpoint: ENDPOINT, model: 'vendor::tuned/model-2027-01-01', imageModel: '' };
    await saveProviderProfile(odd);
    expect((await loadProviderProfile()).model).toBe('vendor::tuned/model-2027-01-01');
    expect(normalizeProviderEndpoint(ENDPOINT)).toBe(ENDPOINT);
  });
});