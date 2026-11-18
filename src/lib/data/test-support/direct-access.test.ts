import { test } from "node:test";
import assert from "node:assert/strict";
import { findDirectAccess } from "./direct-access";

test("the matcher detects every forbidden form and ignores look-alikes", () => {
  const bad = [
    'fetch("/api/x")',
    "window.fetch(url)",
    "globalThis.fetch(url)",
    "self.fetch(url)",
    "fetch (url)",
    "fetch<T>(url)",
    "useSWR(key, fetch)",
    "const f = fetch;",
    "new XMLHttpRequest()",
    "navigator.sendBeacon(u)",
    "axios.get(u)",
    "new Request(u)",
    "new EventSource(u)",
    "new WebSocket(u)",
    "const x = `${fetch(u)}`.length; fetch(u)",
  ];
  for (const s of bad) assert.ok(findDirectAccess(s).length > 0, s);
  const good = [
    "fetcher(url)",
    "refetch()",
    "obj.fetch",
    "obj.fetch(url)",
    "// fetch(url)",
    "/* always fetch(url) */",
    'const s = "fetch(url)";',
    "const s = 'Always fetch archived accounts';",
    "const s = `fetch(${x})`;",
    "useSWR(key, fetcher)",
    "mutate(fetchedAccounts)",
  ];
  for (const s of good) assert.deepEqual(findDirectAccess(s), [], s);
});
