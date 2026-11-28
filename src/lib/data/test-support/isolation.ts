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
 * finance profile (exactly one: it is a per-owner singleton). Every call must answer 2xx or this throws.
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

  // The sample leaves one Future settings record, and no route creates a second one, so add it
  // directly (through the scoped store) to give that collection two records to protect. The
  // finance profile stays at exactly one: MongoDB has a unique {ownerId} index on it.
  const settings = store.collection<BaseDoc & { key: string }>("futureSettings");
  const firstSettings = await settings.findOne({});
  if (!firstSettings) throw new Error("seedOwner: no Future settings");
  await settings.insert({ ...withoutIdentity(firstSettings), key: "second" } as never);
}

/**
 * Calls every route of `allRoutes` as the owner `store` is scoped to, naming only `foreign` records.
 * A route without a :param is called once. A route with params is called once per record with every
 * param set to its _id; a non-GET route is called twice per record: with `{}` and with a valid body
 * (the record minus _id, ownerId and timestamps), so the write reaches the store's update path
 * instead of stopping at validation. Non-GET calls without a body send `{}`. Returns every result.
 */
export async function probeAsStranger(
  store: Store,
  foreign: { _id: string; [key: string]: unknown }[],
): Promise<ApiResult[]> {
  const results: ApiResult[] = [];
  const call = async (method: string, url: string, body: unknown) =>
    results.push(await dispatch(allRoutes, store, method, url, method === "GET" ? undefined : body, FIXED_NOW));
  for (const route of allRoutes) {
    if (!route.path.includes(":")) {
      await call(route.method, route.path, {});
      continue;
    }
    for (const record of foreign) {
      const url = route.path.replace(/:[A-Za-z]+/g, record._id);
      await call(route.method, url, {});
      if (route.method === "GET") continue;
      const valid: Record<string, unknown> = { ...record };
      for (const key of ["_id", "ownerId", "createdAt", "updatedAt"]) delete valid[key];
      await call(route.method, url, valid);
    }
  }
  return results;
}
