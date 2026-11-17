import { test } from "node:test";
import assert from "node:assert/strict";
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";

function files(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((e) =>
    e.isDirectory()
      ? files(join(dir, e.name))
      : /\.(tsx?|jsx?|mjs)$/.test(e.name) && !/\.test\.(tsx?|jsx?|mjs)$/.test(e.name)
        ? [join(dir, e.name)]
        : [],
  );
}

/**
 * Blanks out comments and string/template literals (keeping newlines, so line
 * numbers survive). Handles //, /* *\/, '...', "...", `...` with backslash
 * escapes. A template literal is blanked whole, including any ${...} inside it,
 * and regex literals are not recognised: good enough for prose and UI text.
 */
export function stripCommentsAndStrings(src: string): string {
  let out = "";
  let i = 0;
  while (i < src.length) {
    const c = src[i];
    const n = src[i + 1];
    if (c === "/" && n === "/") {
      while (i < src.length && src[i] !== "\n") i++;
    } else if (c === "/" && n === "*") {
      i += 2;
      while (i < src.length && !(src[i] === "*" && src[i + 1] === "/")) {
        if (src[i] === "\n") out += "\n";
        i++;
      }
      i += 2;
    } else if (c === '"' || c === "'" || c === "`") {
      i++;
      while (i < src.length && src[i] !== c) {
        if (src[i] === "\\") i++;
        if (src[i] === "\n") out += "\n";
        i++;
      }
      i++;
      out += '""';
    } else {
      out += c;
      i++;
    }
  }
  return out;
}

const FORBIDDEN: RegExp[] = [
  // the identifier fetch on its own (call, generic call, spaced call, passed by reference, assigned)
  /(?<![\w$.])fetch(?![\w$])/,
  // fetch reached through a global object
  /(?<![\w$.])(?:window|globalThis|self)\s*(?:\?\.|\.)\s*fetch(?![\w$])/,
  /(?<![\w$.])(?:XMLHttpRequest|axios|EventSource|WebSocket)(?![\w$])/,
  /(?<![\w$.])sendBeacon(?![\w$])|\.\s*sendBeacon(?![\w$])/,
  /(?<![\w$.])new\s+Request\s*\(/,
];

/** Returns the 1-based line numbers of forbidden direct server access. */
export function findDirectAccess(src: string): number[] {
  const lines = stripCommentsAndStrings(src).split("\n");
  return lines.flatMap((l, i) => (FORBIDDEN.some((re) => re.test(l)) ? [i + 1] : []));
}

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

test("Finance client code reaches data only through the request helper", () => {
  const roots = ["src/hooks/finance", "src/components/finance", "src/app/(app)/finance", "src/components/dashboard"].map((d) => join(process.cwd(), ...d.split("/")));
  const all = roots.flatMap(files);
  assert.ok(all.length > 20);
  const offenders = all.flatMap((f) => findDirectAccess(readFileSync(f, "utf8")).map((line) => `${f}:${line}`));
  assert.deepEqual(offenders, []);
  for (const hook of files(roots[0]).filter((f) => /use-(accounts|transactions|categories|finance-profile|payment-plan|projections|summary)\.ts$/.test(f))) {
    assert.match(readFileSync(hook, "utf8"), /from "@\/hooks\/request"/, hook);
  }
});
