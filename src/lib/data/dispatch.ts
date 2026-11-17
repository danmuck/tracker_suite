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
      try {
        params[want[i].slice(1)] = decodeURIComponent(got[i]);
      } catch {
        return null;
      }
    } else if (want[i] !== got[i]) {
      return null;
    }
  }
  return params;
}

export function matchRoute(
  routes: RouteDef[],
  method: string,
  pathname: string,
): { route: RouteDef; params: Record<string, string> } | null {
  // Like Next, prefer static segments: the fewest :params wins, ties go to the first registered.
  let best: { route: RouteDef; params: Record<string, string> } | null = null;
  let bestDynamic = Infinity;
  for (const route of routes) {
    if (route.method !== method) continue;
    const params = matchPath(route.path, pathname);
    if (!params) continue;
    const dynamic = route.path.split("/").filter((s) => s.startsWith(":")).length;
    if (dynamic < bestDynamic) {
      best = { route, params };
      bestDynamic = dynamic;
    }
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
  const queryStart = url.indexOf("?");
  const pathname = queryStart === -1 ? url : url.slice(0, queryStart);
  const query = new URLSearchParams(queryStart === -1 ? "" : url.slice(queryStart + 1));
  const match = matchRoute(routes, method, pathname);
  if (!match) return fail(404, "Not available in browser data mode");
  try {
    return await match.route.handler({ store, params: match.params, query, body });
  } catch (error) {
    if (error instanceof ConflictError) return fail(409, "Already exists");
    console.error(error);
    return fail(500, "Request failed");
  }
}

export function serverGuard(isDemo: boolean): ApiResult | null {
  return isDemo ? fail(403, "The demo does not use a server database") : null;
}

// Refuses every /api request in the demo; used by the proxy before any route runs.
export function demoApiGuard(pathname: string, isDemo: boolean): ApiResult | null {
  if (pathname !== "/api" && !pathname.startsWith("/api/")) return null;
  return serverGuard(isDemo);
}
