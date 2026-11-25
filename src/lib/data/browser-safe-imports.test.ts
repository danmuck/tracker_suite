// Walks the static import graph from browser-reachable code and fails if server-only code is reachable.
// ESLint only sees a file's own imports; this catches a server module pulled in through a helper.

import { test } from "node:test";
import assert from "node:assert/strict";
import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { dirname, join, relative, sep } from "node:path";

const ROOT = process.cwd();
const SRC = join(ROOT, "src");

const FORBIDDEN_SPECIFIERS = new Set(["mongoose", "next/server"]);
const FORBIDDEN_FILES = new Set(
  ["src/lib/db.ts", "src/lib/data/mongo-store.ts", "src/lib/data/serve.ts", "src/lib/api-helpers.ts"].map((f) =>
    join(ROOT, ...f.split("/")),
  ),
);
// Models are server-only; test-support holds node-only helpers for tests (node:fs).
const FORBIDDEN_DIRS = [join(SRC, "models") + sep, join(SRC, "lib", "data", "test-support") + sep];

// A module's server folder (src/lib/<module>/server/) is for route handlers only: it may hold credentials
// and node-only code (the edgectl client and its operator certificate).
const MODULE_SERVER_DIR = new RegExp(`^${escapeForRegex(join(SRC, "lib") + sep)}[^${escapeForRegex(sep)}]+${escapeForRegex(sep)}server${escapeForRegex(sep)}`);

function escapeForRegex(text: string): string {
  return text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

const isForbiddenFile = (file: string) =>
  FORBIDDEN_FILES.has(file) || FORBIDDEN_DIRS.some((d) => file.startsWith(d)) || MODULE_SERVER_DIR.test(file);

const rel = (file: string) => relative(ROOT, file).split(sep).join("/");

function walk(dir: string): string[] {
  if (!existsSync(dir)) return [];
  const out: string[] = [];
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const full = join(dir, entry.name);
    if (entry.isDirectory()) out.push(...walk(full));
    else if (/\.tsx?$/.test(entry.name) && !entry.name.endsWith(".test.ts")) out.push(full);
  }
  return out;
}

function entryPoints(): string[] {
  const entries = [
    ...["hooks", "components", "app/(app)", "app/(site)", "lib/demo"].flatMap((d) => walk(join(SRC, ...d.split("/")))),
    ...walk(join(SRC, "lib", "data")).filter((f) => !isForbiddenFile(f)),
  ];
  for (const m of readdirSync(join(SRC, "lib"), { withFileTypes: true })) {
    if (m.isDirectory()) entries.push(...walk(join(SRC, "lib", m.name, "api")));
  }
  return [...new Set(entries)];
}

function stripComments(source: string): string {
  return source.replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:"'`\\])\/\/.*$/gm, "$1");
}

// Specifiers of static imports and re-exports; whole `import type` / `export type` statements are erased and skipped.
const STATEMENT = /(?:^|[;}\s])(import|export)\s+(type\s+)?(?:[^;'"`]*?\sfrom\s*)?["']([^"']+)["']/g;

export function specifiersOf(source: string): string[] {
  const out: string[] = [];
  for (const [, keyword, isType, specifier] of stripComments(source).matchAll(STATEMENT)) {
    // `export const x = 1` never reaches here: it has no string after it before a `;`; a bare `export {` needs from.
    if (!isType && (keyword === "import" || keyword === "export")) out.push(specifier);
  }
  return out;
}

function resolve(specifier: string, from: string): string | null {
  let base: string;
  if (specifier.startsWith("@/")) base = join(SRC, specifier.slice(2));
  else if (specifier.startsWith(".")) base = join(dirname(from), specifier);
  else return null;
  for (const candidate of [base, `${base}.ts`, `${base}.tsx`, join(base, "index.ts")]) {
    if (existsSync(candidate) && statSync(candidate).isFile()) return candidate;
  }
  return null;
}

const importsCache = new Map<string, { specifier: string; target: string | null }[]>();

function importsOf(file: string) {
  let found = importsCache.get(file);
  if (!found) {
    found = specifiersOf(readFileSync(file, "utf8")).map((specifier) => ({
      specifier,
      target: resolve(specifier, file),
    }));
    importsCache.set(file, found);
  }
  return found;
}


/** Returns the import chain from `entry` to the first forbidden import, or null. */
export function findViolation(entry: string, clean: Set<string>): string[] | null {
  const seen = new Set<string>();
  const stack: { file: string; chain: string[] }[] = [{ file: entry, chain: [rel(entry)] }];
  while (stack.length > 0) {
    const { file, chain } = stack.pop()!;
    if (seen.has(file) || clean.has(file)) continue;
    seen.add(file);
    for (const { specifier, target } of importsOf(file)) {
      if (FORBIDDEN_SPECIFIERS.has(specifier)) return [...chain, specifier];
      if (!target) continue;
      if (isForbiddenFile(target)) return [...chain, rel(target)];
      stack.push({ file: target, chain: [...chain, rel(target)] });
    }
  }
  for (const file of seen) clean.add(file);
  return null;
}

test("import scanner reads static imports and re-exports, skips type-only statements and comments", () => {
  const source = `
    import a from "./a";
    import { type T, b } from "./b";
    import type { U } from "./type-only";
    export type { V } from "./type-reexport";
    export * from "./star";
    export { c } from "./c";
    import "./side-effect";
    // import "./commented";
    /* import "./block"; */
    const url = "https://example.com/x"; import d from "./after-url";
    export const x = 1;
  `;
  assert.deepEqual(specifiersOf(source), ["./a", "./b", "./star", "./c", "./side-effect", "./after-url"]);
});

test("test-support helpers count as forbidden for browser-reachable code", () => {
  const helper = join(SRC, "lib", "data", "test-support", "direct-access.ts");
  assert.ok(existsSync(helper));
  assert.equal(isForbiddenFile(helper), true);
  assert.ok(!entryPoints().includes(helper));
});

test("a module's server folder counts as forbidden for browser-reachable code", () => {
  const client = join(SRC, "lib", "edgectl", "server", "client.ts");
  assert.ok(existsSync(client));
  assert.equal(isForbiddenFile(client), true);
  assert.equal(isForbiddenFile(join(SRC, "lib", "edgectl", "validators.ts")), false);
  assert.ok(!entryPoints().includes(client));
  // The scanner follows an import into it: a hook importing the client is reported.
  const hook = join(SRC, "hooks", "edgectl", "use-mirage.ts");
  importsCache.set(hook, [{ specifier: "@/lib/edgectl/server/client", target: client }]);
  try {
    assert.deepEqual(findViolation(hook, new Set()), ["src/hooks/edgectl/use-mirage.ts", "src/lib/edgectl/server/client.ts"]);
  } finally {
    importsCache.delete(hook);
  }
});

test("no server-only code is reachable from browser-reachable code", () => {
  const entries = entryPoints();
  assert.ok(entries.length > 20, `expected many entry points, found ${entries.length}`);
  const clean = new Set<string>();
  const violations: string[] = [];
  for (const entry of entries) {
    const chain = findViolation(entry, clean);
    if (chain) violations.push(chain.join("\n    -> "));
  }
  assert.deepEqual(violations, [], `server-only code reachable from the browser:\n  ${violations.join("\n  ")}`);
});
