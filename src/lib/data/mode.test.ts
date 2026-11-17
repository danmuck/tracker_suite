import test from "node:test";
import assert from "node:assert/strict";
import { resolveDataSource } from "./mode";

test("resolveDataSource: the demo is always browser; otherwise the saved choice, defaulting to server", () => {
  assert.equal(resolveDataSource(true, null), "browser");
  assert.equal(resolveDataSource(true, "server"), "browser");
  assert.equal(resolveDataSource(false, null), "server");
  assert.equal(resolveDataSource(false, "browser"), "browser");
  assert.equal(resolveDataSource(false, "garbage"), "server");
});
