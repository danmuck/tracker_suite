// Matches a method + URL to a route handler and runs it against a Store.
// Pure: no framework, browser or server imports.

import { fail, type ApiResult, type RouteDef } from "./api";
import { ConflictError, type Store } from "./store";

function matchPath(pattern: string, pathname: string): Record<string, string> | null {
  const want = pattern.split("/");
  const got = pathname.split("/");
  if (want.length !== got.length) return null;
  const params: Record<string, string> = {};
  for (let i = 0; i < want.length; i++) {
    if (want[i].startsWith(":")) {
      let value: string;
      try {
        value = decodeURIComponent(got[i]);
      } catch {
        return null;
      }
      if (value === "") return null;
      params[want[i].slice(1)] = value;
    } else if (want[i] !== got[i]) {
      return null;
    }
  }
  return params;
}

const isParam = (segment: string): boolean => segment.startsWith(":");

// Negative when `a` is more specific: at the first position where one route has a static
// segment and the other a param, the static one wins. Both matched the same path, so they
// have the same length and agree on every position where both are static.
function compareSpecificity(a: string, b: string): number {
  const as = a.split("/");
  const bs = b.split("/");
  for (let i = 0; i < as.length; i++) {
    if (isParam(as[i]) !== isParam(bs[i])) return isParam(as[i]) ? 1 : -1;
  }
  return 0;
}

export function matchRoute(
  routes: RouteDef[],
  method: string,
  pathname: string,
): { route: RouteDef; params: Record<string, string> } | null {
  // Like Next, rank matches segment by segment; full ties go to the first registered.
  const wanted = method.toUpperCase();
  let best: { route: RouteDef; params: Record<string, string> } | null = null;
  for (const route of routes) {
    if (route.method !== wanted) continue;
    const params = matchPath(route.path, pathname);
    if (!params) continue;
    if (!best || compareSpecificity(route.path, best.route.path) < 0) best = { route, params };
  }
  return best;
}

export async function dispatch(
  routes: RouteDef[],
  store: Store,
  method: string,
  url: string,
  body?: unknown,
): Promise<ApiResult> {
  const hash = url.indexOf("#");
  const target = hash === -1 ? url : url.slice(0, hash); // the fragment never reaches a server
  const queryStart = target.indexOf("?");
  const pathname = queryStart === -1 ? target : target.slice(0, queryStart);
  const query = new URLSearchParams(queryStart === -1 ? "" : target.slice(queryStart + 1));
  const match = matchRoute(routes, method, pathname);
  if (!match) return fail(404, "Not available in browser data mode");
  // As on the server, GET and DELETE carry no body.
  const upper = method.toUpperCase();
  const sent = upper === "GET" || upper === "DELETE" ? undefined : body;
  try {
    return await match.route.handler({ store, params: match.params, query, body: sent });
  } catch (error) {
    if (error instanceof ConflictError) return fail(409, "Already exists");
    console.error(error);
    return fail(500, match.route.failure ?? "Request failed");
  }
}

/** The body of a 2xx result; otherwise throws the result's error message. */
export function unwrap<T>(result: ApiResult): T {
  if (result.status >= 200 && result.status < 300) return result.body as T;
  const error = (result.body as { error?: string } | null)?.error;
  throw new Error(error ?? `Request failed: ${result.status}`);
}

export function serverGuard(isDemo: boolean): ApiResult | null {
  return isDemo ? fail(403, "The demo does not use a server database") : null;
}

// Refuses every /api request in the demo; used by the proxy before any route runs.
export function demoApiGuard(pathname: string, isDemo: boolean): ApiResult | null {
  if (pathname !== "/api" && !pathname.startsWith("/api/")) return null;
  return serverGuard(isDemo);
}
