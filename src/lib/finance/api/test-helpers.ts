// Test-only helpers for the Finance handler tests.

import type { ApiResult } from "@/lib/data/api";
import { BrowserStore } from "@/lib/data/browser-store";
import { dispatch } from "@/lib/data/dispatch";
import type { BaseDoc, Collection, CollectionName, Store } from "@/lib/data/store";
import { memoryStorage } from "@/lib/data/test-helpers";
import { financeRoutes } from "./routes";

/** 10:00 on 17 Nov 2026 in New York (the tests run with TZ=America/New_York). */
export const NOW = new Date("2026-11-17T15:00:00.000Z");

/** Runs `fn` with the process time zone set to `tz`, then restores it (Node rereads `TZ` when it changes). */
export async function withTimeZone<T>(tz: string, fn: () => Promise<T>): Promise<T> {
  const before = process.env.TZ;
  process.env.TZ = tz;
  try {
    return await fn();
  } finally {
    if (before === undefined) delete process.env.TZ;
    else process.env.TZ = before;
  }
}

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

type Method = keyof Collection<BaseDoc>;

/**
 * `store` with every collection call yielding to the macrotask queue before it runs, so two
 * requests dispatched together interleave step by step, as two HTTP requests can on MongoDB.
 * `fault(name, method)` may throw to make one call fail.
 */
export function interleavingStore(store: Store, fault?: (name: CollectionName, method: Method) => void): Store {
  return {
    collection<T extends BaseDoc>(name: CollectionName): Collection<T> {
      const real = store.collection<T>(name);
      return new Proxy(real, {
        get(target, prop) {
          const value = Reflect.get(target, prop, target);
          if (typeof value !== "function") return value;
          return async (...args: unknown[]) => {
            await new Promise((resolve) => setImmediate(resolve));
            fault?.(name, prop as Method);
            return value.apply(target, args);
          };
        },
      });
    },
  };
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
