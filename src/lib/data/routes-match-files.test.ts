import { test } from "node:test";
import assert from "node:assert/strict";
import { readdirSync, readFileSync } from "node:fs";
import { join, relative, sep } from "node:path";
import { allRoutes } from "./all-routes";

const API_DIR = join(import.meta.dirname, "..", "..", "app", "api");

function routeFiles(dir: string): string[] {
  const out: string[] = [];
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const full = join(dir, entry.name);
    if (entry.isDirectory()) out.push(...routeFiles(full));
    else if (entry.name === "route.ts") out.push(full);
  }
  return out;
}

// src/app/api/links/[linkId]/route.ts -> /api/links/:linkId
function pathFor(file: string): string {
  const dirs = relative(API_DIR, file).split(sep).slice(0, -1);
  return ["/api", ...dirs.map((d) => d.replace(/^\[(.+)\]$/, ":$1"))].join("/");
}

const SERVE = /export const (\w+) = serve\("(\w+)", "([^"]+)"\)/g;

test("every serve() route export matches its method, its file's location and a defined route", () => {
  let checked = 0;
  for (const file of routeFiles(API_DIR)) {
    const source = readFileSync(file, "utf8");
    if (!source.includes("serve(")) continue;
    const expected = pathFor(file);
    const exports = [...source.matchAll(SERVE)];
    assert.ok(exports.length > 0, `${file} calls serve( but no export matched`);
    for (const [, name, method, path] of exports) {
      assert.equal(name, method, `${file}: export ${name} serves ${method}`);
      assert.equal(path, expected, `${file}: serves ${path}`);
      assert.ok(
        allRoutes.some((r) => r.method === method && r.path === path),
        `${file}: ${method} ${path} is not in allRoutes`,
      );
      checked++;
    }
  }
  assert.ok(checked > 0);
});
