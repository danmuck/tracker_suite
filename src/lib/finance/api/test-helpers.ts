// Test-only helpers for the Finance handler tests.

import type { ApiResult } from "@/lib/data/api";
import { BrowserStore } from "@/lib/data/browser-store";
import { dispatch } from "@/lib/data/dispatch";
import type { CollectionName } from "@/lib/data/store";
import { memoryStorage } from "@/lib/data/test-helpers";
import { financeRoutes } from "./routes";

/** 10:00 on 17 Nov 2026 in New York (the tests run with TZ=America/New_York). */
export const NOW = new Date("2026-11-17T15:00:00.000Z");

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

/** A counting store plus `call`, which dispatches to `financeRoutes` with a clock starting at NOW. */
export function setup(): {
  store: BrowserStore;
  writes: (name: CollectionName) => number;
  call: (method: string, url: string, body?: unknown) => Promise<ApiResult>;
  setNow: (now: Date) => void;
} {
  const { store, writes } = countingStore();
  let now = NOW;
  return {
    store,
    writes,
    call: (method, url, body) => dispatch(financeRoutes, store, method, url, body, now),
    setNow: (next) => {
      now = next;
    },
  };
}
