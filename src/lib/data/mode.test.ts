import test from "node:test";
import assert from "node:assert/strict";
import { resolveDataSource, sourceChanged } from "./mode";

test("resolveDataSource: the demo is always browser; otherwise the saved choice, defaulting to server", () => {
  assert.equal(resolveDataSource(true, null), "browser");
  assert.equal(resolveDataSource(true, "server"), "browser");
  assert.equal(resolveDataSource(false, null), "server");
  assert.equal(resolveDataSource(false, "browser"), "browser");
  assert.equal(resolveDataSource(false, "garbage"), "server");
});

test("sourceChanged: reload only when another tab's saved choice resolves to a different source, never in the demo", () => {
  assert.equal(sourceChanged(false, "server", "browser"), true);
  assert.equal(sourceChanged(false, "browser", "server"), true);
  assert.equal(sourceChanged(false, "browser", null), true); // storage cleared: back to server
  assert.equal(sourceChanged(false, "server", null), false);
  assert.equal(sourceChanged(false, "server", "garbage"), false);
  assert.equal(sourceChanged(false, "browser", "browser"), false);
  assert.equal(sourceChanged(true, "browser", "server"), false);
  assert.equal(sourceChanged(true, "browser", null), false);
});
