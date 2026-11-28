// Seeds one owner through the real routes and probes every route as a stranger.
// Depends only on the Store interface and dispatch (no BrowserStore), so a script can reuse it
// over MongoDB. Browser-safe apart from the test-support folder rule: only *.test.ts files import it.

import type { ApiResult } from "@/lib/data/api";
import { allRoutes } from "@/lib/data/all-routes";
import { dispatch } from "@/lib/data/dispatch";
import type { BaseDoc, Store } from "@/lib/data/store";
import { loadSampleData } from "@/lib/demo";

/** Every request in this file runs at this instant, so Finance's catch-up is deterministic. */
export const FIXED_NOW = new Date("2026-06-15T12:00:00.000Z");

async function request(store: Store, method: string, url: string, body?: unknown): Promise<unknown> {
  const result = await dispatch(allRoutes, store, method, url, body, FIXED_NOW);
  if (result.status < 200 || result.status >= 300) {
    throw new Error(`seedOwner: ${method} ${url} answered ${result.status} ${JSON.stringify(result.body)}`);
  }
  return result.body;
}

/** Strips the stored identity of a record so it can be inserted again as a second one. */
function withoutIdentity(doc: BaseDoc): Omit<BaseDoc, keyof BaseDoc> {
  const rest: Record<string, unknown> = { ...doc };
  for (const key of ["_id", "createdAt", "updatedAt"]) delete rest[key];
  return rest as Omit<BaseDoc, keyof BaseDoc>;
}

/**
 * Fills every collection with at least two records for the owner `store` is scoped to, using the
 * demo sample (written through each module's own routes) plus the values that exercise unique
 * fields: a link group named "Gaming", the default finance categories, Future settings and a
 * finance profile. Every call must answer 2xx or this throws.
 */
export async function seedOwner(store: Store): Promise<void> {
  await loadSampleData(store, FIXED_NOW);

  await request(store, "POST", "/api/link-groups", { name: "Gaming" });

  // A scratchpad for every project: the sample writes only one.
  const projects = (await request(store, "GET", "/api/projects")) as { _id: string }[];
  if (projects.length < 2) throw new Error("seedOwner: expected at least two projects");
  for (const [i, project] of projects.entries()) {
    await request(store, "PUT", `/api/projects/${project._id}/scratchpad`, { content: `scratchpad ${i}` });
  }

  // Future settings and the finance profile hold one record each through the routes; add a second
  // directly (through the scoped store) so those collections have two records to protect.
  const settings = store.collection<BaseDoc & { key: string }>("futureSettings");
  const firstSettings = await settings.findOne({});
  if (!firstSettings) throw new Error("seedOwner: no Future settings");
  await settings.insert({ ...withoutIdentity(firstSettings), key: "second" } as never);

  const profiles = store.collection<BaseDoc>("financeProfile");
  const firstProfile = await profiles.findOne({});
  if (!firstProfile) throw new Error("seedOwner: no finance profile");
  await profiles.insert(withoutIdentity(firstProfile) as never);
}

/**
 * Calls every route of `allRoutes` as the owner `store` is scoped to, naming only `foreignIds`:
 * a route without a :param once, one with params once per id (every param set to that id).
 * Non-GET calls send `{}`. Returns every result.
 */
export async function probeAsStranger(store: Store, foreignIds: string[]): Promise<ApiResult[]> {
  const results: ApiResult[] = [];
  for (const route of allRoutes) {
    const body = route.method === "GET" ? undefined : {};
    if (!route.path.includes(":")) {
      results.push(await dispatch(allRoutes, store, route.method, route.path, body, FIXED_NOW));
      continue;
    }
    for (const id of foreignIds) {
      const url = route.path.replace(/:[A-Za-z]+/g, id);
      results.push(await dispatch(allRoutes, store, route.method, url, body, FIXED_NOW));
    }
  }
  return results;
}
