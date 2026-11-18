import { test } from "node:test";
import assert from "node:assert/strict";
import { isWebUrl, safeHref, webUrl } from "./safe-url";

test("isWebUrl accepts http and https addresses", () => {
  assert.equal(isWebUrl("https://example.com"), true);
  assert.equal(isWebUrl("http://192.168.1.10:8006/path?q=1"), true);
  assert.equal(isWebUrl("  HTTPS://Example.com  "), true);
});

test("isWebUrl refuses script, data and other schemes", () => {
  for (const bad of [
    "javascript:alert(1)",
    "JavaScript:alert(1)",
    " javascript:alert(1)",
    "java\tscript:alert(1)",
    "data:text/html,<script>alert(1)</script>",
    "vbscript:msgbox(1)",
    "file:///etc/passwd",
    "//evil.example",
    "https//missing-colon",
    "https://",
    "",
  ]) {
    assert.equal(isWebUrl(bad), false, bad);
  }
});

test("safeHref drops anything that is not a web address", () => {
  assert.equal(safeHref("javascript:alert(1)"), undefined);
  assert.equal(safeHref(undefined), undefined);
  assert.equal(safeHref(""), undefined);
  assert.equal(safeHref(" https://example.com "), "https://example.com");
});

test("webUrl schema enforces the same rule", () => {
  assert.equal(webUrl().safeParse("javascript:alert(1)").success, false);
  assert.equal(webUrl().safeParse("https://example.com").success, true);
  assert.equal(webUrl().safeParse(`https://example.com/${"a".repeat(2000)}`).success, false);
});
