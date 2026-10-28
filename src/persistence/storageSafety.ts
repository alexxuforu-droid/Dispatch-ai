import AsyncStorage from '@react-native-async-storage/async-storage';

/** Thrown by a slot reader when the stored value is readable JSON but the wrong shape. */
export class CorruptStorageError extends Error {}

/**
 * The result of reading a storage slot.
 * `empty` is a first run, `corrupt` means the value was unreadable and has been kept aside
 * under `quarantineKey` so no later write can destroy it.
 */
export type StorageRead<T> =
  | { status: 'ok'; value: T }
  | { status: 'empty'; value: T }
  | { status: 'corrupt'; value: T; quarantineKey: string; reason: string };

export const CORRUPT_KEY_MARKER = '.corrupt.';

export function corruptKey(key: string, at: number = Date.now()): string {
  return `${key}${CORRUPT_KEY_MARKER}${at}`;
}

/** Moves an unreadable value aside. The original slot is emptied so the app can start clean. */
export async function quarantineValue(key: string, raw: string, at: number = Date.now()): Promise<string> {
  let target = corruptKey(key, at);
  for (let attempt = 1; attempt < 100 && await AsyncStorage.getItem(target) !== null; attempt += 1) {
    target = `${corruptKey(key, at)}-${attempt}`;
  }
  await AsyncStorage.setItem(target, raw);
  await AsyncStorage.removeItem(key);
  return target;
}

/** Quarantine that never throws: a failed copy must not hide the corruption from the caller. */
export async function quarantineUnreadable(key: string, raw: string, at: number = Date.now()): Promise<string> {
  try { return await quarantineValue(key, raw, at); } catch { return ''; }
}

/**
 * Reads and parses a JSON slot. A parse failure is quarantined and reported, never thrown,
 * so one broken value cannot wedge every later write.
 */
export async function readJsonSlot<T>(key: string, parse: (raw: unknown) => T, fallback: T): Promise<StorageRead<T>> {
  const raw = await AsyncStorage.getItem(key);
  if (raw === null || raw === undefined || raw === '') return { status: 'empty', value: fallback };
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch (error) {
    return { status: 'corrupt', value: fallback, quarantineKey: await quarantineUnreadable(key, raw), reason: reasonOf(error) };
  }
  try {
    return { status: 'ok', value: parse(parsed) };
  } catch (error) {
    if (!(error instanceof CorruptStorageError)) throw error;
    return { status: 'corrupt', value: fallback, quarantineKey: await quarantineUnreadable(key, raw), reason: reasonOf(error) };
  }
}

/**
 * Guarantees a slot holds readable JSON before a write replaces it. An unreadable value is
 * moved aside first; if that copy fails the write fails too, because overwriting would be
 * the one thing that destroys the data.
 */
export async function preserveReadableSlot(key: string): Promise<string | null> {
  const raw = await AsyncStorage.getItem(key);
  if (raw === null || raw === undefined || raw === '') return null;
  try { JSON.parse(raw); return null; } catch { return await quarantineValue(key, raw); }
}

function reasonOf(error: unknown): string {
  return error instanceof Error ? error.message : 'the stored value could not be read';
}
