// Browser-side request path: runs the shared route handlers against browser storage.

import { allRoutes } from "./all-routes";
import { BrowserStore, type StorageLike } from "./browser-store";
import { dispatch } from "./dispatch";
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
  window.addEventListener("storage", (event) => {
    if (!event.key?.startsWith(PREFIX)) return;
    const name = event.key.slice(PREFIX.length);
    if (name in COLLECTIONS) created.invalidate(name as CollectionName);
  });
  store = created;
  return created;
}

export async function localRequest<T>(method: string, url: string, body?: unknown): Promise<T> {
  const result = await dispatch(allRoutes, getBrowserStore(), method, url, body);
  if (result.status >= 200 && result.status < 300) return result.body as T;
  const error = (result.body as { error?: string } | null)?.error;
  throw new Error(error ?? `Request failed: ${result.status}`);
}
