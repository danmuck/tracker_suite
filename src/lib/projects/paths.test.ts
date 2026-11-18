import { test } from "node:test";
import assert from "node:assert/strict";
import { projectHref } from "./paths";

test("projectHref puts the id in the query string, encoded", () => {
  assert.equal(projectHref("abc123"), "/projects/view?id=abc123");
  assert.equal(projectHref("x/y?z"), "/projects/view?id=x%2Fy%3Fz");
});
