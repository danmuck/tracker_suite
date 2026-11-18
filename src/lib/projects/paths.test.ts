import { test } from "node:test";
import assert from "node:assert/strict";
import { projectHref, projectIdParam } from "./paths";

test("projectHref puts the id in the query string, encoded", () => {
  assert.equal(projectHref("abc123"), "/projects/view?id=abc123");
  assert.equal(projectHref("x/y?z"), "/projects/view?id=x%2Fy%3Fz");
});

test("projectIdParam accepts only stored ids", () => {
  assert.equal(projectIdParam("69a32272e3624d105ddf1d39"), "69a32272e3624d105ddf1d39");
  for (const bad of [null, "", "../tasks/x", "69a32272e3624d105ddf1d39/scratchpad", "69a32272e3624d105ddf1d3", "zz".repeat(12), "..%2Ftasks"]) {
    assert.equal(projectIdParam(bad), "", String(bad));
  }
});
