// Test-only helpers shared by the data layer tests.

import { createMemoryStorage, type StorageLike } from "./browser-store";

export function memoryStorage(): StorageLike & { failWrites: boolean } {
  const base = createMemoryStorage();
  return {
    failWrites: false,
    getItem: (key) => base.getItem(key),
    setItem(key, value) {
      if (this.failWrites) throw new Error("QuotaExceededError");
      base.setItem(key, value);
    },
    removeItem: (key) => base.removeItem(key),
    key: (index) => base.key(index),
    get length() {
      return base.length;
    },
  };
}
