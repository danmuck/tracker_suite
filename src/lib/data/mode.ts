// Which data source the app reads and writes: the server database or browser storage.
// Importable in Node: window and localStorage are only touched inside functions.

import { useSyncExternalStore } from "react";

export type DataSource = "server" | "browser";

export const IS_DEMO = process.env.NEXT_PUBLIC_DEMO === "1";
export const DATA_SOURCE_KEY = "ts:data-source";

export function resolveDataSource(isDemo: boolean, saved: string | null): DataSource {
  if (isDemo) return "browser";
  return saved === "browser" ? "browser" : "server";
}

export function getDataSource(): DataSource {
  let saved: string | null = null;
  if (typeof window !== "undefined") {
    try {
      saved = window.localStorage.getItem(DATA_SOURCE_KEY);
    } catch {
      saved = null;
    }
  }
  return resolveDataSource(IS_DEMO, saved);
}

export function setDataSource(source: DataSource): void {
  if (IS_DEMO || typeof window === "undefined") return;
  try {
    window.localStorage.setItem(DATA_SOURCE_KEY, source);
  } catch {
    return;
  }
  window.location.reload();
}

// The page reloads when the source changes here, so only another tab's change needs listening for.
function subscribe(onChange: () => void): () => void {
  const listener = (event: StorageEvent) => {
    if (event.key === DATA_SOURCE_KEY || event.key === null) onChange();
  };
  window.addEventListener("storage", listener);
  return () => window.removeEventListener("storage", listener);
}

// The real source, or null until it is known on the client (always null on the server and
// during hydration in the owner's build). Gate anything that fetches on this, so browser
// mode never reaches the server database. The demo is always "browser", so it resolves at once.
export function useResolvedDataSource(): DataSource | null {
  return useSyncExternalStore(subscribe, getDataSource, () => (IS_DEMO ? "browser" : null));
}

export function useDataSource(): DataSource {
  return useSyncExternalStore(subscribe, getDataSource, () => resolveDataSource(IS_DEMO, null));
}
