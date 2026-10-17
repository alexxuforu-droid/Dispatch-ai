/**
 * Headless tests for the model-catalog pure pieces: parseModelIds, ModelCatalogCache,
 * and the connect-time population path of testProviderConnection.
 * Native modules are mocked away; fetch is stubbed. No App import.
 */

jest.mock('../src/persistence/providerCredentials', () => ({ loadProviderSecret: jest.fn(async () => 'test-key') }));
jest.mock('../src/persistence/providerProfile', () => ({ defaultProviderProfile: { endpoint: 'https://api.openai.com/v1', model: '', imageModel: '' } }));

import { ModelCatalogCache, MODEL_CATALOG_TTL_MS, parseModelIds, providerModelCatalog, testProviderConnection } from '../src/providers/openai-compatible';
import type { ProviderProfile } from '../src/persistence/providerProfile';

const ENDPOINT = 'https://api.openai.com/v1';
const profile: ProviderProfile = { endpoint: ENDPOINT, model: 'gpt-4o', imageModel: '' };

function stubFetch(response: { ok: boolean; status: number; json: () => Promise<unknown> }): void {
  (globalThis as { fetch?: unknown }).fetch = jest.fn(async () => response);
}

describe('parseModelIds', () => {
  test('collects trimmed, de-duplicated string ids in listed order', () => {
    expect(parseModelIds({ data: [{ id: 'gpt-4o' }, { id: ' gpt-4o ' }, { id: 'o1' }, { id: 'o1' }] })).toEqual(['gpt-4o', 'o1']);
  });

  test('returns an empty list for missing, non-array, or malformed data without throwing', () => {
    expect(parseModelIds({})).toEqual([]);
    expect(parseModelIds({ data: null })).toEqual([]);
    expect(parseModelIds({ data: 'gpt-4o' })).toEqual([]);
    expect(parseModelIds(null)).toEqual([]);
    expect(parseModelIds(undefined)).toEqual([]);
    expect(parseModelIds({ data: [{}, { id: 7 }, { id: '' }, { id: null }, 'gpt-4o'] })).toEqual([]);
  });
});

describe('ModelCatalogCache', () => {
  test('returns recorded ids until the fetched-at stamp goes stale', () => {
    const cache = new ModelCatalogCache(1000);
    cache.record(ENDPOINT, ['a', 'b'], 500);
    expect(cache.lookup(ENDPOINT, 1500)).toEqual(['a', 'b']);
    expect(cache.lookup(ENDPOINT, 1501)).toEqual([]);
  });

  test('keys entries by endpoint and replaces ids on refetch', () => {
    const cache = new ModelCatalogCache(10_000);
    cache.record(ENDPOINT, ['a'], 1000);
    cache.record('https://openrouter.ai/api/v1', ['z'], 1000);
    expect(cache.lookup(ENDPOINT, 2000)).toEqual(['a']);
    expect(cache.lookup('https://openrouter.ai/api/v1', 2000)).toEqual(['z']);
    cache.record(ENDPOINT, ['a', 'b'], 1500);
    expect(cache.lookup(ENDPOINT, 2000)).toEqual(['a', 'b']);
    expect(cache.lookup(ENDPOINT, 11_501)).toEqual([]);
  });

  test('exposes a fresh default TTL for the shared instance', () => {
    expect(MODEL_CATALOG_TTL_MS).toBe(600_000);
  });
});

describe('testProviderConnection catalog population', () => {
  test('caches the ids listed by a stub /models response at connect time', async () => {
    stubFetch({ ok: true, status: 200, json: async () => ({ data: [{ id: 'a' }, { id: 'b' }, { id: 'c' }] }) });
    await expect(testProviderConnection(profile)).resolves.toBeUndefined();
    expect(providerModelCatalog.lookup(ENDPOINT, Date.now())).toEqual(['a', 'b', 'c']);
  });

  test('tolerates a provider whose /models body carries no data array', async () => {
    stubFetch({ ok: true, status: 200, json: async () => ({ error: 'not listed' }) });
    await expect(testProviderConnection(profile)).resolves.toBeUndefined();
    expect(providerModelCatalog.lookup(ENDPOINT, Date.now())).toEqual([]);
  });

  test('tolerates a body that is not JSON', async () => {
    stubFetch({ ok: true, status: 200, json: async () => { throw new Error('bad json'); } });
    await expect(testProviderConnection(profile)).resolves.toBeUndefined();
    expect(providerModelCatalog.lookup(ENDPOINT, Date.now())).toEqual([]);
  });

  test('still fails a rejected key and caches nothing new', async () => {
    stubFetch({ ok: false, status: 401, json: async () => ({}) });
    await expect(testProviderConnection(profile)).rejects.toThrow(/API key/);
  });

  test('records nothing for the endpoint when the provider rejects the key outright', async () => {
    const control = 'https://control.example.com/v1';
    providerModelCatalog.record(control, ['control-entry'], Date.now());
    stubFetch({ ok: false, status: 401, json: async () => ({}) });
    await expect(testProviderConnection(profile)).rejects.toThrow(/API key/);
    expect(providerModelCatalog.lookup(ENDPOINT, Date.now())).toEqual([]);
    expect(providerModelCatalog.lookup(control, Date.now())).toEqual(['control-entry']);
  });

  test('leaves a previously cached catalog untouched when the key is rejected', async () => {
    providerModelCatalog.record(ENDPOINT, ['already-cached'], Date.now());
    stubFetch({ ok: false, status: 401, json: async () => ({}) });
    await expect(testProviderConnection(profile)).rejects.toThrow(/API key/);
    expect(providerModelCatalog.lookup(ENDPOINT, Date.now())).toEqual(['already-cached']);
  });
});
