import test from "node:test";
import assert from "node:assert/strict";
import { DEFAULT_LIMIT, LIMIT_OPTIONS, limitFromParam, pageFromParam } from "./list-params";

test("pageFromParam: a whole number ≥ 1, anything else is page 1", () => {
  assert.deepEqual(["1", "2", "37"].map(pageFromParam), [1, 2, 37]);
  for (const bad of [null, "", "0", "-1", "1.5", "abc", "2x", " 3", "1e3", "99999999999999999999"]) assert.equal(pageFromParam(bad), 1, String(bad));
});

test("limitFromParam: one of the offered page sizes, anything else is the default", () => {
  assert.deepEqual(LIMIT_OPTIONS.map((l) => limitFromParam(String(l))), [...LIMIT_OPTIONS]);
  for (const bad of [null, "", "0", "7", "500", "501", "-10", "25.0", "abc"]) assert.equal(limitFromParam(bad), DEFAULT_LIMIT, String(bad));
});
