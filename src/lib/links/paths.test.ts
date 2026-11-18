import { test } from "node:test";
import assert from "node:assert/strict";
import { linkGroupHref } from "./paths";

test("linkGroupHref puts the slug in the query string, encoded", () => {
  assert.equal(linkGroupHref("homelab"), "/links/group?slug=homelab");
  assert.equal(linkGroupHref("a&b=c"), "/links/group?slug=a%26b%3Dc");
});
