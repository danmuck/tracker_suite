// Handler types shared by the server routes and browser data mode.
// Pure: no framework, browser or server imports.

import type { ZodError } from "zod";
import type { Store } from "./store";

export interface ApiResult {
  status: number;
  body: unknown;
}

export interface HandlerContext {
  store: Store;
  params: Record<string, string>;
  query: URLSearchParams;
  body: unknown;
}

export type Handler = (ctx: HandlerContext) => Promise<ApiResult>;
export type Method = "GET" | "POST" | "PUT" | "PATCH" | "DELETE";

export interface RouteDef {
  method: Method;
  path: string; // e.g. "/api/links/:linkId"
  handler: Handler;
  failure?: string; // the error message returned when the handler throws unexpectedly
}

export const ok = (body: unknown, status = 200): ApiResult => ({ status, body });

export const fail = (status: number, error: string, details?: unknown): ApiResult => ({
  status,
  body: details === undefined ? { error } : { error, details },
});

export const notFound = (what: string): ApiResult => fail(404, `${what} not found`);

export const invalid = (error: ZodError): ApiResult =>
  fail(400, "Validation failed", error.flatten());

// Lowercase only: generated and stored ids are always lowercase.
export const isId = (value: string): boolean => /^[0-9a-f]{24}$/.test(value);

/** Escape a string for literal use inside a RegExp */
export function escapeRegex(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/**
 * Update for a full-replace PUT: sets every provided field and
 * removes each optional field that was left out, so clearing a field sticks.
 */
export function setAndUnset<T extends Record<string, unknown>>(
  data: T,
  optionalKeys: readonly string[],
): { $set: Record<string, unknown>; $unset?: Record<string, 1> } {
  const $set: Record<string, unknown> = {};
  const $unset: Record<string, 1> = {};
  for (const [key, value] of Object.entries(data)) {
    if (value !== undefined && value !== "") $set[key] = value;
  }
  for (const key of optionalKeys) {
    if (!(key in $set)) $unset[key] = 1;
  }
  return Object.keys($unset).length ? { $set, $unset } : { $set };
}
