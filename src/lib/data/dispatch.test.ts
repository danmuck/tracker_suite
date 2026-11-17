import { test } from "node:test";
import assert from "node:assert/strict";
import { escapeRegex, fail, isId, ok, setAndUnset, type RouteDef } from "./api";
import { BrowserStore } from "./browser-store";
import { demoApiGuard, dispatch, serverGuard } from "./dispatch";
import { ConflictError } from "./store";
import { memoryStorage } from "./test-helpers";

const routes: RouteDef[] = [
  { method: "GET", path: "/api/links", handler: async ({ query }) => ok({ group: query.get("groupId") }) },
  { method: "GET", path: "/api/links/:linkId", handler: async ({ params }) => ok(params) },
  { method: "POST", path: "/api/links", handler: async ({ body }) => ok(body, 201) },
  { method: "DELETE", path: "/api/links/:linkId", handler: async () => { throw new ConflictError("links", "slug"); } },
  { method: "PUT", path: "/api/links/:linkId", handler: async () => { throw new Error("boom"); } },
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
  assert.deepEqual([isId("a".repeat(24)), isId("abc"), isId("z".repeat(24))], [true, false, false]);
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
