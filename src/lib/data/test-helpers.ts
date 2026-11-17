// Test-only helpers shared by the data layer tests.

import type { StorageLike } from "./browser-store";

export function memoryStorage(): StorageLike & { failWrites: boolean } {
  const map = new Map<string, string>();
  return {
    failWrites: false,
    getItem: (key) => map.get(key) ?? null,
    setItem(key, value) {
      if (this.failWrites) throw new Error("QuotaExceededError");
      map.set(key, value);
    },
    removeItem: (key) => {
      map.delete(key);
    },
    key: (index) => [...map.keys()][index] ?? null,
    get length() {
      return map.size;
    },
  };
}
