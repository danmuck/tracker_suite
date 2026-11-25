import { test } from "node:test";
import assert from "node:assert/strict";
import { base64ByteLength, formatBytes, outputView } from "./output";
import { intentHref, intentIdParam, apiPath } from "./paths";
import { stateTone, targetLabel } from "./format";

test("utf8 output is shown as text", () => {
  assert.deepEqual(outputView({ stdout: "world\n", stderr: "", output_encoding: "utf8" }), { kind: "text", stdout: "world\n", stderr: "" });
  // Anything that is not base64 is text, as the contract's default.
  assert.equal(outputView({ stdout: "x", stderr: "y", output_encoding: "" }).kind, "text");
});

test("base64 output is binary: sized, never decoded", () => {
  const bytes = Buffer.from([0xff, 0xfe, 0x00, 0x01, 0x80]);
  const view = outputView({ stdout: bytes.toString("base64"), stderr: "", output_encoding: "base64" });
  assert.deepEqual(view, { kind: "binary", stdout: "//4AAYA=", stderr: "", stdoutBytes: 5, stderrBytes: 0 });
});

test("base64ByteLength matches the decoded size for every padding", () => {
  for (let n = 0; n <= 10; n++) {
    assert.equal(base64ByteLength(Buffer.alloc(n, 0xab).toString("base64")), n, `length ${n}`);
  }
  assert.equal(base64ByteLength("//4A\nAYA=\n"), 5);
});

test("formatBytes", () => {
  assert.equal(formatBytes(0), "0 bytes");
  assert.equal(formatBytes(1), "1 byte");
  assert.equal(formatBytes(1023), "1023 bytes");
  assert.equal(formatBytes(1536), "1.5 KB");
  assert.equal(formatBytes(3 * 1024 * 1024), "3.0 MB");
});

test("intent links carry the id in the query string, and only a usable id comes back out", () => {
  assert.equal(intentHref("intent.gui.1.a1b2"), "/edgectl/intent?id=intent.gui.1.a1b2");
  assert.equal(intentHref("a b&c"), "/edgectl/intent?id=a%20b%26c");
  assert.equal(intentIdParam("intent.gui.1.a1b2"), "intent.gui.1.a1b2");
  for (const bad of [null, "", "../ghosts", "a/b", "a?b", ".."]) assert.equal(intentIdParam(bad), "", String(bad));
});

test("apiPath encodes each segment", () => {
  assert.equal(apiPath(), "/api/edgectl");
  assert.equal(apiPath("intents", "intent.gui.1", "reconcile"), "/api/edgectl/intents/intent.gui.1/reconcile");
  assert.equal(apiPath("executions", "a/b c"), "/api/edgectl/executions/a%2Fb%20c");
});

test("state words map to a tone; an unknown word is shown as busy, an empty one as idle", () => {
  assert.equal(stateTone("satisfied"), "good");
  assert.equal(stateTone("success"), "good");
  assert.equal(stateTone("failed"), "bad");
  assert.equal(stateTone("error"), "bad");
  assert.equal(stateTone("in_progress"), "busy");
  assert.equal(stateTone("dispatched"), "busy");
  assert.equal(stateTone(""), "idle");
  assert.equal(targetLabel("ghost:ghost.local"), "ghost.local");
  assert.equal(targetLabel("fleet"), "fleet");
});
