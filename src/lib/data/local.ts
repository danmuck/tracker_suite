// Browser-side request path: runs the shared route handlers against browser storage.

import { allRoutes } from "./all-routes";
import type { ApiResult } from "./api";
import { BrowserStore, type StorageLike } from "./browser-store";
import { dispatch, unwrap } from "./dispatch";
import { createSerialQueue } from "./serial-queue";
import { createStorageResolver } from "./storage";
import { COLLECTIONS, type CollectionName } from "./store";

const PREFIX = "ts:data:";

let store: BrowserStore | null = null;

// Reading window.localStorage throws when site data is blocked; the resolver then
// falls back to one shared in-memory storage, so the store and the seed flag agree.
const storage = createStorageResolver(() => window.localStorage);

export const getBrowserStorage = (): StorageLike => storage.get();
export const isBrowserStoragePersistent = (): boolean => storage.isPersistent();

export function getBrowserStore(): BrowserStore {
  if (store) return store;
  const created = new BrowserStore(getBrowserStorage());
  // Another tab wrote to a collection: drop this tab's cached copy of it.
  // A null key means another tab cleared storage: drop every collection.
  window.addEventListener("storage", (event) => {
    if (event.key === null) {
      created.invalidate();
      return;
    }
    if (!event.key.startsWith(PREFIX)) return;
    const name = event.key.slice(PREFIX.length);
    if (Object.hasOwn(COLLECTIONS, name)) created.invalidate(name as CollectionName);
  });
  store = created;
  return created;
}

// One request at a time: a handler's read-then-write can then never interleave with another
// request's (e.g. two page-load GETs both posting the same due payment). FIFO; a failed
// request does not block the ones after it.
const serial = createSerialQueue();

/**
 * One browser-mode request on `store`. It first drops the tab's cached collections: another tab
 * may have written since, and the `storage` event that says so can still be queued. A request
 * then decides (the Cash check, the categories seed, a claim) on what is in storage now, and a
 * write never puts back this tab's stale copy over another tab's newer one.
 */
export function dispatchFresh(store: BrowserStore, method: string, url: string, body?: unknown): Promise<ApiResult> {
  store.refresh();
  return dispatch(allRoutes, store, method, url, body);
}

export function localRequest<T>(method: string, url: string, body?: unknown): Promise<T> {
  return serial(async () => unwrap<T>(await dispatchFresh(getBrowserStore(), method, url, body)));
}

/**
 * Runs a job that touches browser storage directly (loading the sample, a reset, the demo seed)
 * on the same queue, so it never interleaves with an in-flight local request. It starts from
 * storage too, not from this tab's cached copy.
 */
export function runExclusive<T>(job: () => Promise<T>): Promise<T> {
  return serial(() => {
    getBrowserStore().refresh();
    return job();
  });
}
