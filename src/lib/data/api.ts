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
}

export const ok = (body: unknown, status = 200): ApiResult => ({ status, body });

export const fail = (status: number, error: string, details?: unknown): ApiResult => ({
  status,
  body: details === undefined ? { error } : { error, details },
});

export const notFound = (what: string): ApiResult => fail(404, `${what} not found`);

export const invalid = (error: ZodError): ApiResult =>
  fail(400, "Validation failed", error.flatten());

export const isId = (value: string): boolean => /^[0-9a-f]{24}$/i.test(value);
