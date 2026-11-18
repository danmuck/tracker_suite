import { test } from "node:test";
import assert from "node:assert/strict";
import { linkSchema } from "./validators";

test("links must be web addresses", () => {
  const base = { groupId: "g1", name: "x" };
  assert.equal(linkSchema.safeParse({ ...base, url: "javascript:alert(1)" }).success, false);
  assert.equal(linkSchema.safeParse({ ...base, url: "data:text/html,hi" }).success, false);
  assert.equal(linkSchema.safeParse({ ...base, url: "https://example.com" }).success, true);
});
