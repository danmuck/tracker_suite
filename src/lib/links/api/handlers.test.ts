import { test } from "node:test";
import assert from "node:assert/strict";
import { BrowserStore } from "@/lib/data/browser-store";
import { dispatch } from "@/lib/data/dispatch";
import { memoryStorage } from "@/lib/data/test-helpers";
import type { LinkGroup } from "@/types/links/link-group";
import type { LinkItem } from "@/types/links/link";
import { linksRoutes } from "./routes";

let store = new BrowserStore(memoryStorage());
const call = (method: string, url: string, body?: unknown) => dispatch(linksRoutes, store, method, url, body);

test.beforeEach(() => {
  store = new BrowserStore(memoryStorage());
});

test("groups: create assigns slug and order; list returns link counts in order", async () => {
  const a = (await call("POST", "/api/link-groups", { name: "  Home Lab  ", icon: "Server" })).body as LinkGroup;
  const b = (await call("POST", "/api/link-groups", { name: "Gaming" })).body as LinkGroup;
  assert.deepEqual([a.name, a.slug, a.order, b.order], ["Home Lab", "home-lab", 0, 1]);
  await call("POST", "/api/links", { groupId: a._id, name: "Router", url: "https://router.example" });
  const list = (await call("GET", "/api/link-groups")).body as LinkGroup[];
  assert.deepEqual(list.map((g) => [g.name, g.linkCount]), [["Home Lab", 1], ["Gaming", 0]]);
});

test("groups: a duplicate name gets a suffixed slug", async () => {
  await call("POST", "/api/link-groups", { name: "Gaming" });
  const second = (await call("POST", "/api/link-groups", { name: "Gaming" })).body as LinkGroup;
  assert.match(second.slug, /^gaming-\d+$/);
});

test("groups: update re-slugs on rename and keeps the icon when omitted; delete cascades", async () => {
  const g = (await call("POST", "/api/link-groups", { name: "Tools", icon: "Wrench" })).body as LinkGroup;
  await call("POST", "/api/links", { groupId: g._id, name: "X", url: "https://x.example" });
  const renamed = (await call("PUT", `/api/link-groups/${g._id}`, { name: "Dev Tools" })).body as LinkGroup;
  assert.deepEqual([renamed.slug, renamed.icon], ["dev-tools", "Wrench"]);
  assert.equal((await call("DELETE", `/api/link-groups/${g._id}`)).status, 200);
  assert.deepEqual((await call("GET", `/api/links?groupId=${g._id}`)).body, []);
});

test("links: create orders within the group, update changes name and url only", async () => {
  const g = (await call("POST", "/api/link-groups", { name: "G" })).body as LinkGroup;
  const one = (await call("POST", "/api/links", { groupId: g._id, name: "One", url: "https://one.example" })).body as LinkItem;
  const two = (await call("POST", "/api/links", { groupId: g._id, name: "Two", url: "https://two.example" })).body as LinkItem;
  assert.deepEqual([one.order, two.order], [0, 1]);
  const updated = (await call("PUT", `/api/links/${one._id}`, { groupId: "ignored", name: "Uno", url: "https://uno.example" })).body as LinkItem;
  assert.deepEqual([updated.name, updated.url, updated.groupId, updated.order], ["Uno", "https://uno.example", g._id, 0]);
  assert.deepEqual(((await call("GET", `/api/links?groupId=${g._id}`)).body as LinkItem[]).map((l) => l.name), ["Uno", "Two"]);
});

test("validation failures are 400; unknown and malformed ids are 404", async () => {
  assert.equal((await call("POST", "/api/link-groups", { name: "" })).status, 400);
  assert.equal((await call("POST", "/api/links", { groupId: "a".repeat(24), name: "N", url: "not a url" })).status, 400);
  assert.deepEqual(await call("POST", "/api/links", { groupId: "a".repeat(24), name: "N", url: "https://n.example" }), { status: 404, body: { error: "Link group not found" } });
  for (const id of ["abc", "a".repeat(24)]) {
    assert.deepEqual(await call("GET", `/api/link-groups/${id}`), { status: 404, body: { error: "Group not found" } });
    assert.deepEqual(await call("DELETE", `/api/links/${id}`), { status: 404, body: { error: "Link not found" } });
  }
});
