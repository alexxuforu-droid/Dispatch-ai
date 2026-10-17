/**
 * One AsyncStorage mock for the whole suite.
 *
 * Five files used to carry a byte-identical copy, which meant the failure-injection mode
 * needed for the read/write error-policy tests would have to be added five times. The
 * store is per-file on purpose: each test file gets its own module registry, so two files
 * running in parallel never share a Map. Only the *factory* is shared.
 *
 * `storageFailures` is what makes the ledger's deliberate asymmetry observable: recordUsage
 * swallows a write failure so a finished run is never sunk, while readUsage propagates so
 * the screen can say "could not read" instead of showing a confident empty state.
 */

export const storageBacking = new Map<string, string>();

export const storageFailures = { get: false, set: false, remove: false };

const boom = (op: string) => new Error(`async-storage ${op} failed (injected)`);

export const asyncStorageMock = {
  __esModule: true,
  default: {
    getItem: async (key: string) => {
      if (storageFailures.get) throw boom('getItem');
      return storageBacking.has(key) ? storageBacking.get(key)! : null;
    },
    setItem: async (key: string, value: string) => {
      if (storageFailures.set) throw boom('setItem');
      storageBacking.set(key, value);
    },
    removeItem: async (key: string) => {
      if (storageFailures.remove) throw boom('removeItem');
      storageBacking.delete(key);
    },
    clear: async () => { storageBacking.clear(); },
    getAllKeys: async () => [...storageBacking.keys()],
  },
};

export function resetAsyncStorageMock(): void {
  storageBacking.clear();
  storageFailures.get = false;
  storageFailures.set = false;
  storageFailures.remove = false;
}