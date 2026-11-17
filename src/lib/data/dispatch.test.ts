import { test } from "node:test";
import assert from "node:assert/strict";
import { escapeRegex, fail, isId, ok, setAndUnset, type RouteDef } from "./api";
import { BrowserStore } from "./browser-store";
import { demoApiGuard, dispatch, matchRoute, serverGuard, unwrap } from "./dispatch";
import { linksRoutes } from "@/lib/links/api/routes";
import { futureRoutes } from "@/lib/future/api/routes";
import { ConflictError } from "./store";
import { memoryStorage } from "./test-helpers";

const routes: RouteDef[] = [
  { method: "GET", path: "/api/links", handler: async ({ query }) => ok({ group: query.get("groupId") }) },
  { method: "GET", path: "/api/links/:linkId", handler: async ({ params }) => ok(params) },
  { method: "POST", path: "/api/links", handler: async ({ body }) => ok(body, 201) },
  { method: "DELETE", path: "/api/links/:linkId", handler: async () => { throw new ConflictError("links", "slug"); } },
  { method: "PUT", path: "/api/links/:linkId", handler: async () => { throw new Error("boom"); } },
  { method: "PATCH", path: "/api/links/:linkId", handler: async () => { throw new Error("boom"); }, failure: "Failed to patch link" },
];
const store = new BrowserStore(memoryStorage());

test("dispatch matches method and path, passing params, query and body", async () => {
  assert.deepEqual(await dispatch(routes, store, "GET", "/api/links?groupId=g1"), { status: 200, body: { group: "g1" } });
  assert.deepEqual(await dispatch(routes, store, "GET", "/api/links/abc"), { status: 200, body: { linkId: "abc" } });
  assert.deepEqual(await dispatch(routes, store, "GET", "/api/links/a%20b"), { status: 200, body: { linkId: "a b" } });
  assert.deepEqual(await dispatch(routes, store, "POST", "/api/links", { a: 1 }), { status: 201, body: { a: 1 } });
});

test("dispatch reports unknown routes, conflicts and crashes as results", async () => {
  assert.deepEqual(await dispatch(routes, store, "GET", "/api/accounts"), { status: 404, body: { error: "Not available in browser data mode" } });
  assert.equal((await dispatch(routes, store, "PATCH", "/api/links")).status, 404);
  assert.equal((await dispatch(routes, store, "GET", "/api/links/a/b")).status, 404);
  assert.equal((await dispatch(routes, store, "DELETE", "/api/links/x")).status, 409);
  const original = console.error;
  console.error = () => {};
  try {
    assert.deepEqual(await dispatch(routes, store, "PUT", "/api/links/x"), { status: 500, body: { error: "Request failed" } });
  } finally {
    console.error = original;
  }
});

test("fail includes details only when given", () => {
  assert.deepEqual(fail(400, "bad"), { status: 400, body: { error: "bad" } });
  assert.deepEqual(fail(400, "bad", [1]), { status: 400, body: { error: "bad", details: [1] } });
});

test("serverGuard blocks only the demo, and isId accepts 24 hex characters", () => {
  assert.equal(serverGuard(false), null);
  assert.deepEqual(serverGuard(true), { status: 403, body: { error: "The demo does not use a server database" } });
  assert.deepEqual([isId("a".repeat(24)), isId("abc"), isId("z".repeat(24)), isId("A".repeat(24))], [true, false, false, false]);
});

test("demoApiGuard refuses every API path in the demo and nothing else", () => {
  const refused = { status: 403, body: { error: "The demo does not use a server database" } };
  for (const path of ["/api/accounts", "/api", "/api/links/abc"]) {
    assert.deepEqual(demoApiGuard(path, true), refused);
  }
  assert.equal(demoApiGuard("/api/accounts", false), null);
  for (const path of ["/links", "/apiary", "/"]) {
    assert.equal(demoApiGuard(path, true), null);
  }
});

test("matchRoute prefers static segments over params regardless of registration order", async () => {
  const mixed: RouteDef[] = [
    { method: "GET", path: "/api/x/:id", handler: async () => ok("param") },
    { method: "GET", path: "/api/x/special", handler: async () => ok("static") },
  ];
  assert.equal((await dispatch(mixed, store, "GET", "/api/x/special")).body, "static");
  assert.equal((await dispatch(mixed, store, "GET", "/api/x/abc")).body, "param");
});

test("setAndUnset sets provided fields and unsets omitted optional ones; escapeRegex escapes", () => {
  assert.deepEqual(setAndUnset({ a: 1, b: "", c: undefined }, ["b", "c", "d"]), { $set: { a: 1 }, $unset: { b: 1, c: 1, d: 1 } });
  assert.deepEqual(setAndUnset({ a: 1 }, []), { $set: { a: 1 } });
  assert.equal(escapeRegex("St. Paul (West)"), "St\\. Paul \\(West\\)");
});

test("a crash returns the route's failure text, or Request failed when none is set", async () => {
  const original = console.error;
  console.error = () => {};
  try {
    assert.deepEqual(await dispatch(routes, store, "PATCH", "/api/links/x"), { status: 500, body: { error: "Failed to patch link" } });
    assert.deepEqual(await dispatch(routes, store, "PUT", "/api/links/x"), { status: 500, body: { error: "Request failed" } });
  } finally {
    console.error = original;
  }
});

test("every Links and Future route names its failure text", () => {
  for (const route of [...linksRoutes, ...futureRoutes]) {
    assert.ok(typeof route.failure === "string" && route.failure.length > 0, `${route.method} ${route.path}`);
  }
});

test("matchRoute ranks segment by segment: the first static segment where routes differ wins", async () => {
  const ranked: RouteDef[] = [
    { method: "GET", path: "/a/:x/c", handler: async () => ok("x") },
    { method: "GET", path: "/a/b/:y", handler: async () => ok("y") },
  ];
  assert.equal((await dispatch(ranked, store, "GET", "/a/b/c")).body, "y");
  assert.equal((await dispatch(ranked, store, "GET", "/a/z/c")).body, "x");
  const tied: RouteDef[] = [
    { method: "GET", path: "/t/:a", handler: async () => ok("first") },
    { method: "GET", path: "/t/:b", handler: async () => ok("second") },
  ];
  assert.equal((await dispatch(tied, store, "GET", "/t/1")).body, "first");
});

test("empty params do not match, fragments are ignored, methods compare case-insensitively", async () => {
  assert.equal(matchRoute(routes, "GET", "/api/links/"), null);
  assert.equal((await dispatch(routes, store, "GET", "/api/links/")).status, 404);
  assert.deepEqual(await dispatch(routes, store, "GET", "/api/links/abc#top"), { status: 200, body: { linkId: "abc" } });
  assert.deepEqual(await dispatch(routes, store, "GET", "/api/links?groupId=g1#frag"), { status: 200, body: { group: "g1" } });
  assert.deepEqual(await dispatch(routes, store, "get", "/api/links/abc"), { status: 200, body: { linkId: "abc" } });
  assert.deepEqual(await dispatch(routes, store, "post", "/api/links", { a: 1 }), { status: 201, body: { a: 1 } });
});

test("GET and DELETE handlers get no body, whatever the caller sent", async () => {
  const seen: unknown[] = [];
  const record: RouteDef["handler"] = async ({ body }) => {
    seen.push(body);
    return ok(null);
  };
  const echo: RouteDef[] = [
    { method: "GET", path: "/e", handler: record },
    { method: "DELETE", path: "/e", handler: record },
    { method: "PUT", path: "/e", handler: record },
  ];
  await dispatch(echo, store, "GET", "/e", { a: 1 });
  await dispatch(echo, store, "delete", "/e", { a: 1 });
  await dispatch(echo, store, "PUT", "/e", { a: 1 });
  assert.deepEqual(seen, [undefined, undefined, { a: 1 }]);
});

test("unwrap returns 2xx bodies and throws the error message otherwise", () => {
  assert.deepEqual(unwrap({ status: 200, body: { a: 1 } }), { a: 1 });
  assert.deepEqual(unwrap({ status: 201, body: [1] }), [1]);
  assert.throws(() => unwrap({ status: 404, body: { error: "Link not found" } }), { message: "Link not found" });
  assert.throws(() => unwrap({ status: 500, body: null }), { message: "Request failed: 500" });
  assert.throws(() => unwrap({ status: 500, body: {} }), { message: "Request failed: 500" });
});

test("dispatch hands the handler the clock it was given, and the current time by default", async () => {
  const routes: RouteDef[] = [{ method: "GET", path: "/api/now", handler: async ({ now }) => ok(now.toISOString()) }];
  const store = new BrowserStore(memoryStorage());
  const fixed = new Date("2026-11-17T15:00:00.000Z");
  assert.deepEqual(await dispatch(routes, store, "GET", "/api/now", undefined, fixed), { status: 200, body: "2026-11-17T15:00:00.000Z" });
  const before = Date.now();
  const body = (await dispatch(routes, store, "GET", "/api/now")).body as string;
  assert.ok(Date.parse(body) >= before && Date.parse(body) <= Date.now());
});
