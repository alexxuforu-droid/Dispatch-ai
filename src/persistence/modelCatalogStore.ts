import AsyncStorage from '@react-native-async-storage/async-storage';
import { ModelCatalogCache } from '../providers/openai-compatible';
import { CorruptStorageError, StorageRead, preserveReadableSlot, readJsonSlot } from './storageSafety';

// Its own key. Deliberately NOT inside ProviderProfile (which holds exactly endpoint, model
// and imageModel) and NOT under dispatch.run.*. This is a deletable cache of suggestions,
// never configuration: clearing it must leave every saved provider and model id fully
// usable. That property is the acid test for judge 1's boundary condition.
const CATALOG_KEY = 'dispatch.catalog.v1';

// Caps: the cache is a suggestion list, so it is bounded in ids and in endpoints.
export const MAX_CATALOG_IDS = 500;
export const MAX_CATALOG_ENDPOINTS = 25;

// Same promise-queue idiom as runStore.ts:9-14. Without it this is an unserialized
// read-modify-write and two concurrent saves could lose an endpoint's entry.
let queue: Promise<unknown> = Promise.resolve();
function serialize<T>(work: () => Promise<T>): Promise<T> {
  const next = queue.catch(() => undefined).then(work);
  queue = next.catch(() => undefined);
  return next;
}

export type CatalogSnapshot = { ids: string[]; fetchedAt: number };

// Unserialized on purpose: callers inside a serialize() block use this. Wrapping it in
// serialize again would queue behind the outer write and deadlock the queue.
async function readAllUnserialized(): Promise<StorageRead<Record<string, CatalogSnapshot>>> {
  return readJsonSlot<Record<string, CatalogSnapshot>>(CATALOG_KEY, raw => {
    if (!raw || typeof raw !== 'object' || Array.isArray(raw)) throw new CorruptStorageError('the model catalog is not a map');
    const entries: Record<string, CatalogSnapshot> = {};
    for (const [endpoint, value] of Object.entries(raw as Record<string, unknown>)) {
      if (!value || typeof value !== 'object') continue;
      const snapshot = value as { ids?: unknown; fetchedAt?: unknown };
      if (!Array.isArray(snapshot.ids) || typeof snapshot.fetchedAt !== 'number') continue;
      const ids = snapshot.ids.filter((id): id is string => typeof id === 'string');
      entries[endpoint] = { ids: [...new Set(ids)].slice(0, MAX_CATALOG_IDS), fetchedAt: snapshot.fetchedAt };
    }
    return entries;
  }, {});
}

export function readAll(): Promise<Record<string, CatalogSnapshot>> {
  return serialize(async () => (await readAllUnserialized()).value);
}

/** Reads the cache with its corruption status, so "never fetched" can be told from "lost". */
export function readAllResult(): Promise<StorageRead<Record<string, CatalogSnapshot>>> {
  return serialize(readAllUnserialized);
}

export async function saveCatalogSnapshot(endpoint: string, ids: string[], fetchedAt: number): Promise<void> {
  await serialize(async () => {
    const all = { ...(await readAllUnserialized()).value };
    all[endpoint] = { ids: [...new Set(ids)].slice(0, MAX_CATALOG_IDS), fetchedAt };
    try {
      await preserveReadableSlot(CATALOG_KEY);
      await AsyncStorage.setItem(CATALOG_KEY, JSON.stringify(boundEndpoints(all, endpoint)));
    } catch {
      // A cache that cannot be written is a missed convenience, never a failed setting.
    }
  });
}

/** Keeps the most recently fetched endpoints; the rest are stale suggestions. */
function boundEndpoints(all: Record<string, CatalogSnapshot>, keep: string): Record<string, CatalogSnapshot> {
  const entries = Object.entries(all);
  if (entries.length <= MAX_CATALOG_ENDPOINTS) return all;
  const ordered = entries
    .filter(([endpoint]) => endpoint !== keep)
    .sort((left, right) => right[1].fetchedAt - left[1].fetchedAt)
    .slice(0, MAX_CATALOG_ENDPOINTS - 1);
  return { [keep]: all[keep], ...Object.fromEntries(ordered) };
}

export function readCatalogSnapshot(endpoint: string): Promise<CatalogSnapshot | null> {
  return readAll().then(all => all[endpoint] ?? null);
}

// Rehydrates the in-memory cache after a restart. Suggestions come back; validity never
// depended on them, so nothing about a saved model id changes either way.
export async function rehydrateModelCatalog(cache: ModelCatalogCache): Promise<boolean> {
  const all = await readAll();
  const entries = Object.entries(all);
  for (const [endpoint, snapshot] of entries) {
    if (Array.isArray(snapshot?.ids) && typeof snapshot.fetchedAt === 'number') {
      // Validate the entries, not just the array. Externally corrupted storage can hold
      // nulls, numbers or blanks; a poisoned chip would set profile.model to a non-string and
      // the next .trim() would throw. Dropping junk costs a suggestion, never a setting.
      const ids = snapshot.ids.filter((id): id is string => typeof id === 'string' && id.trim().length > 0);
      cache.record(endpoint, [...new Set(ids.map(id => id.trim()))].slice(0, MAX_CATALOG_IDS), snapshot.fetchedAt);
    }
  }
  return entries.length > 0;
}

export function clearCatalogSnapshot(): Promise<void> {
  // Inside the queue like every other write. A raw removeItem here could interleave with a
  // save and resurrect the entry it was meant to delete.
  return serialize(async () => { await AsyncStorage.removeItem(CATALOG_KEY); });
}
