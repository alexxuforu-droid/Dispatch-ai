/**
 * Acid test for the model-catalog boundary condition.
 *
 * The catalog is a suggestion source and never an authority. This suite tries to make it
 * one, and asserts that every previously saved provider and model id still loads and still
 * sends no matter what happens to the cache or to the provider's /models listing.
 */

jest.mock('@react-native-async-storage/async-storage', () => require('./asyncStorageMock').asyncStorageMock);
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
    await expect(refreshModelCatalog({ ...defaultProviderProfile, endpoint: ENDPOINT, model: SAVED_MODEL, imageModel: '' })).rejects.toThrow('The provider returned HTTP 500.');
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

// This is the one preference-gate break that previously slipped through. Every other case here
// clears the cache before loading the profile, so a `suggestions[0]` fallback in the profile
// loader never fired and the acid test stayed green while the authority leak was in place.
// The gap was the absence of a persisted snapshot at the moment the profile is read back.
describe('a persisted snapshot is still not a preference', () => {
  test('a saved snapshot cannot become the source of the saved model id', async () => {
    stubModels(['alpha', 'beta', 'gamma']);
    const profile = { ...defaultProviderProfile, endpoint: ENDPOINT, model: SAVED_MODEL, imageModel: '' };
    await refreshModelCatalog(profile);
    await saveCatalogSnapshot(ENDPOINT, ['alpha', 'beta', 'gamma'], Date.now());

    // The durable artifact is present and usable as a suggestion source...
    expect((await readCatalogSnapshot(ENDPOINT))?.ids).toEqual(['alpha', 'beta', 'gamma']);
    expect(providerModelCatalog.lookup(ENDPOINT)).toEqual(['alpha', 'beta', 'gamma']);

    // ...and the saved id still wins, unrewritten.
    const loaded = await loadProviderProfile();
    expect(loaded.model).toBe(SAVED_MODEL);

    const { bodies } = stubChat();
    await completeChat(loaded, [{ role: 'user', content: 'go' }]);
    expect(bodies[0].model).toBe(SAVED_MODEL);
  });

  test('a persisted snapshot that omits the saved id leaves it alone too', async () => {
    stubModels(['alpha', 'beta']);
    await refreshModelCatalog({ ...defaultProviderProfile, endpoint: ENDPOINT, model: SAVED_MODEL, imageModel: '' });
    await saveCatalogSnapshot(ENDPOINT, ['alpha', 'beta'], Date.now());

    expect(providerModelCatalog.lookup(ENDPOINT)).not.toContain(SAVED_MODEL);
    const loaded = await loadProviderProfile();
    expect(loaded.model).toBe(SAVED_MODEL);
  });

  test('an empty persisted snapshot cannot blank the saved id', async () => {
    await saveCatalogSnapshot(ENDPOINT, [], Date.now());
    providerModelCatalog.forget(ENDPOINT);
    await rehydrateModelCatalog(providerModelCatalog);

    expect((await readCatalogSnapshot(ENDPOINT))?.ids).toEqual([]);
    const loaded = await loadProviderProfile();
    expect(loaded.model).toBe(SAVED_MODEL);
  });
});

describe('a refresh keys its suggestions under the NORMALIZED endpoint', () => {
  // Every other test here uses an already-normalized ENDPOINT constant, so nothing caught a
  // refresh that recorded under the raw string. A saved profile may legitimately carry a
  // trailing slash or a mixed-case host; the catalog key must not, or the chips the screen
  // looks up will not match the entry the refresh wrote.
  const raw = 'https://api.openai.com/v1/';
  const messy = 'https://API.openAI.com/v1';

  test.each([raw, messy])('raw endpoint %s still lands under the normalized key', async rawEndpoint => {
    stubModels(['m1', 'm2']);
    await refreshModelCatalog({ ...defaultProviderProfile, endpoint: rawEndpoint, model: SAVED_MODEL, imageModel: '' });

    // Readable at the normalized key the app actually uses...
    expect(providerModelCatalog.lookup(ENDPOINT)).toEqual(['m1', 'm2']);
    // ...and not stranded at the raw one, which would be invisible forever after.
    expect(providerModelCatalog.lookup(rawEndpoint)).toEqual([]);
  });

  test('the saved id survives a refresh whose endpoint needed normalizing', async () => {
    stubModels(['m1', 'm2']);
    await refreshModelCatalog({ ...defaultProviderProfile, endpoint: raw, model: SAVED_MODEL, imageModel: '' });

    expect((await loadProviderProfile()).model).toBe(SAVED_MODEL);
    const { bodies } = stubChat();
    await completeChat(await loadProviderProfile(), [{ role: 'user', content: 'go' }]);
    expect(bodies[0].model).toBe(SAVED_MODEL);
  });
});

describe('a corrupted cache cannot poison the suggestion list', () => {
  // Corrupted external storage is the only way in, and Array.isArray is not enough validation.
  // nulls, numbers and blanks all pass it, and a poisoned chip would set profile.model to a
  // non-string so the next .trim() throws.
  test('non-string and blank ids rehydrate only the real ones', async () => {
    const AsyncStorage = jest.requireMock('@react-native-async-storage/async-storage').default;
    await AsyncStorage.setItem('dispatch.catalog.v1', JSON.stringify({
      [ENDPOINT]: { fetchedAt: Date.now(), ids: [null, 7, '   ', 'ok-id', 'ok-id', ' second '] },
    }));
    const fresh = new ModelCatalogCache();
    await rehydrateModelCatalog(fresh);
    expect(fresh.lookup(ENDPOINT, Date.now())).toEqual(['ok-id', 'second']);
    for (const id of fresh.lookup(ENDPOINT, Date.now())) expect(typeof id).toBe('string');
    expect((await loadProviderProfile()).model).toBe(SAVED_MODEL);
  });

  test('a snapshot of nothing but junk yields zero suggestions rather than junk', async () => {
    const AsyncStorage = jest.requireMock('@react-native-async-storage/async-storage').default;
    await AsyncStorage.setItem('dispatch.catalog.v1', JSON.stringify({
      [ENDPOINT]: { fetchedAt: Date.now(), ids: [null, 0, false, {}, ''] },
    }));
    const fresh = new ModelCatalogCache();
    await rehydrateModelCatalog(fresh);
    expect(fresh.lookup(ENDPOINT, Date.now())).toEqual([]);
    expect((await loadProviderProfile()).model).toBe(SAVED_MODEL);
  });
});