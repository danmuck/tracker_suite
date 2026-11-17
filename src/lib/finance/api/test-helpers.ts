// Test-only helpers for the Finance handler tests.

import { BrowserStore } from "@/lib/data/browser-store";
import type { CollectionName } from "@/lib/data/store";
import { memoryStorage } from "@/lib/data/test-helpers";

/** A BrowserStore over memory storage that counts storage writes per collection. */
export function countingStore(): { store: BrowserStore; writes: (name: CollectionName) => number } {
  const storage = memoryStorage();
  const counts = new Map<string, number>();
  const setItem = storage.setItem.bind(storage);
  storage.setItem = (key: string, value: string) => {
    counts.set(key, (counts.get(key) ?? 0) + 1);
    setItem(key, value);
  };
  return { store: new BrowserStore(storage), writes: (name) => counts.get(`ts:data:${name}`) ?? 0 };
}
