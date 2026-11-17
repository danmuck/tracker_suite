// Browser-side request path: runs the shared route handlers against browser storage.

import { allRoutes } from "./all-routes";
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

export function localRequest<T>(method: string, url: string, body?: unknown): Promise<T> {
  return serial(async () => unwrap<T>(await dispatch(allRoutes, getBrowserStore(), method, url, body)));
}
