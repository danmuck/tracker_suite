import { test } from "node:test";
import assert from "node:assert/strict";
import { isId, fail, ok, type RouteDef } from "./api";
import { BrowserStore } from "./browser-store";
import { dispatch, serverGuard } from "./dispatch";
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
