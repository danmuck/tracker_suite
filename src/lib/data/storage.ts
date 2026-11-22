// Chooses the storage behind browser data mode, once per page.
// Pure: the localStorage getter is injected, so this runs under node --test.

import { createMemoryStorage, type StorageLike } from "./browser-store";

export interface StorageResolver {
  get(): StorageLike;
  /** False when the in-memory fallback is in use: data then lasts for the page session only. */
  isPersistent(): boolean;
}

export function createStorageResolver(getLocal: () => StorageLike): StorageResolver {
  let chosen: StorageLike | null = null;
  let persistent = false;
  const resolve = (): StorageLike => {
    if (chosen) return chosen;
    try {
      const local = getLocal();
      // Some browsers expose localStorage but throw on write.
      local.setItem("ts:data:probe", "1");
      local.removeItem("ts:data:probe");
      chosen = local;
      persistent = true;
    } catch {
      chosen = createMemoryStorage();
    }
    return chosen;
  };
  return {
    get: resolve,
    isPersistent() {
      resolve();
      return persistent;
    },
  };
}

// A reload only helps when the seeded data survives it.
export function shouldReloadAfterSeed(seeded: boolean, persistent: boolean): boolean {
  return seeded && persistent;
}
