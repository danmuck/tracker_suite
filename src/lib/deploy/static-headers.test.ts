import { test } from "node:test";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { buildHeaders, contentSecurityPolicy, inlineScripts, MAX_LINE, servedPaths } from "./static-headers";

const sha = (s: string) => `'sha256-${createHash("sha256").update(s, "utf8").digest("base64")}'`;

test("inlineScripts hashes exact inline script bodies and skips external and data scripts", () => {
  const body = 'self.__next_f.push([1,"a\\u003c"])';
  const html = `<head><script src="/_next/a.js" async></script><script>${body}</script>
    <script type="application/json">{"x":1}</script><script type="module">m()</script></head>`;
  const { hashes, handlers } = inlineScripts(html);
  assert.deepEqual(hashes, [sha(body), sha("m()")].sort());
  assert.deepEqual(handlers, []);
});

test("inlineScripts reports inline event handlers", () => {
  assert.deepEqual(inlineScripts(`<img src="x" onerror="alert(1)">`).handlers, ["onerror"]);
  assert.deepEqual(inlineScripts(`<p>turn on=off</p>`).handlers, []);
});

test("the policy allows no inline or eval script and no third-party host", () => {
  const csp = contentSecurityPolicy(["'sha256-abc'"]);
  assert.match(csp, /script-src 'self' 'sha256-abc';/);
  assert.doesNotMatch(csp, /script-src[^;]*unsafe/);
  assert.doesNotMatch(csp, /https?:/);
  for (const d of ["default-src 'none'", "object-src 'none'", "base-uri 'none'", "frame-ancestors 'none'"]) {
    assert.ok(csp.includes(d), d);
  }
});

test("servedPaths maps export files to URL paths", () => {
  assert.deepEqual(servedPaths("index.html"), ["/"]);
  assert.deepEqual(servedPaths("finance/accounts.html"), ["/finance/accounts", "/finance/accounts/"]);
  assert.deepEqual(servedPaths("links/index.html"), ["/links", "/links/"]);
});

test("buildHeaders gives each page its own policy, detaching the fallback", () => {
  const out = buildHeaders([
    { file: "404.html", html: "<script>nf()</script>" },
    { file: "links.html", html: "<script>l()</script>" },
  ]);
  const fallback = out.split("\n\n")[0];
  assert.ok(fallback.startsWith("/*\n"));
  assert.ok(fallback.includes(sha("nf()")));
  assert.ok(fallback.includes("Strict-Transport-Security"));
  const links = out.split("\n\n").find((b) => b.startsWith("/links\n"));
  assert.ok(links);
  assert.ok(links.includes("! Content-Security-Policy"));
  assert.ok(links.includes(sha("l()")));
  assert.ok(!links.includes(sha("nf()")));
});

test("buildHeaders refuses a page with inline handlers, a missing 404, or an over-long line", () => {
  assert.throws(() => buildHeaders([{ file: "404.html", html: '<a onclick="x()">' }]), /inline event handlers/);
  assert.throws(() => buildHeaders([{ file: "index.html", html: "" }]), /404/);
  const many = Array.from({ length: 60 }, (_, i) => `<script>s${i}()</script>`).join("");
  assert.ok(contentSecurityPolicy(inlineScripts(many).hashes).length > MAX_LINE);
  assert.throws(() => buildHeaders([{ file: "404.html", html: many }]), /limit/);
});
