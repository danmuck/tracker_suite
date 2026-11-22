"use client";

import { useSyncExternalStore } from "react";
import type { TransactionFormData } from "@/types/finance/transaction";
import type { FinanceProfileData } from "@/types/finance/datasheet";

/**
 * What-if changes for the Projections page. They live only in this browser
 * (localStorage) and are sent with projection requests; real data is never
 * written. The sandbox is dropped when cleared or when real data changes.
 */
export interface SandboxState {
  /** Fingerprint of the real data these changes were made against */
  version: string | null;
  added: { id: string; data: TransactionFormData }[];
  edited: Record<string, TransactionFormData>;
  removed: string[];
  /** What-if Datasheet (cents); null means the real Datasheet applies */
  profile: FinanceProfileData | null;
}

const STORAGE_KEY = "finance.projections.sandbox";
const EMPTY: SandboxState = { version: null, added: [], edited: {}, removed: [], profile: null };

let state: SandboxState = EMPTY;
let loaded = false;
const listeners = new Set<() => void>();

function load() {
  if (loaded || typeof window === "undefined") return;
  loaded = true;
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return;
    const p = JSON.parse(raw);
    state = {
      version: typeof p.version === "string" ? p.version : null,
      added: Array.isArray(p.added) ? p.added : [],
      edited: p.edited && typeof p.edited === "object" ? p.edited : {},
      removed: Array.isArray(p.removed) ? p.removed : [],
      profile: p.profile && typeof p.profile === "object" ? p.profile : null,
    };
  } catch {
    state = EMPTY;
  }
}

export function sandboxChangeCount(s: SandboxState) {
  return s.added.length + Object.keys(s.edited).length + s.removed.length + (s.profile ? 1 : 0);
}

function commit(next: SandboxState) {
  // An emptied sandbox forgets which data it was made against
  state = sandboxChangeCount(next) === 0 ? EMPTY : next;
  try {
    if (state === EMPTY) localStorage.removeItem(STORAGE_KEY);
    else localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  } catch {
    // storage unavailable: the sandbox still works until the page reloads
  }
  listeners.forEach((l) => l());
}

export const isSandboxId = (id: string) => id.startsWith("sbx-");

export const projectionSandbox = {
  add(data: TransactionFormData) {
    load();
    const id = `sbx-${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;
    commit({ ...state, added: [...state.added, { id, data }] });
  },
  /** Change a transaction: a sandbox addition is updated in place, a real one gets an override */
  edit(id: string, data: TransactionFormData) {
    load();
    if (isSandboxId(id)) {
      commit({ ...state, added: state.added.map((a) => (a.id === id ? { id, data } : a)) });
    } else {
      commit({ ...state, edited: { ...state.edited, [id]: data } });
    }
  },
  /** Leave a transaction out of the projection */
  remove(id: string) {
    load();
    if (isSandboxId(id)) {
      commit({ ...state, added: state.added.filter((a) => a.id !== id) });
    } else {
      const edited = { ...state.edited };
      delete edited[id];
      commit({ ...state, edited, removed: state.removed.includes(id) ? state.removed : [...state.removed, id] });
    }
  },
  /** Undo a single edit or removal of a real transaction */
  restore(id: string) {
    load();
    const edited = { ...state.edited };
    delete edited[id];
    commit({ ...state, edited, removed: state.removed.filter((r) => r !== id) });
  },
  /** Set the what-if Datasheet; null goes back to the real one */
  setProfile(profile: FinanceProfileData | null) {
    load();
    commit({ ...state, profile });
  },
  /** Put back changes that could not be applied; they attach to the data as it is now */
  replace(next: Omit<SandboxState, "version">) {
    load();
    commit({ ...next, version: null });
  },
  clear() {
    load();
    commit(EMPTY);
  },
  setVersion(version: string) {
    load();
    if (state.version !== version && sandboxChangeCount(state) > 0) commit({ ...state, version });
  },
};

function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

function getSnapshot() {
  load();
  return state;
}

export function useProjectionSandbox(): SandboxState {
  return useSyncExternalStore(subscribe, getSnapshot, () => EMPTY);
}
