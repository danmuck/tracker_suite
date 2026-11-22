"use client";

import { useSyncExternalStore } from "react";

/**
 * Which sidebar module sections are expanded. Kept in localStorage so a
 * section stays open across pages and reloads, until it is collapsed by hand.
 */
const KEY = "ts:sidebar-open";
const listeners = new Set<() => void>();

// Used when localStorage is unavailable, so the state still lasts the session
let memory: string | null = null;

function read(): string {
  if (memory !== null) return memory;
  try {
    return localStorage.getItem(KEY) ?? "";
  } catch {
    return "";
  }
}

function write(ids: string[]) {
  const value = ids.join(",");
  try {
    localStorage.setItem(KEY, value);
  } catch {
    memory = value;
  }
  listeners.forEach((listener) => listener());
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

function parse(value: string): string[] {
  return value ? value.split(",") : [];
}

export function setSectionOpen(id: string, open: boolean) {
  const ids = parse(read());
  if (ids.includes(id) === open) return;
  write(open ? [...ids, id] : ids.filter((other) => other !== id));
}

export function useOpenSections(): string[] {
  return parse(useSyncExternalStore(subscribe, read, () => ""));
}
