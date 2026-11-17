import { test } from "node:test";
import assert from "node:assert/strict";
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { join, relative, sep } from "node:path";
import { allRoutes } from "./all-routes";

const API_DIR = join(import.meta.dirname, "..", "..", "app", "api");
const ESLINT_CONFIG = join(import.meta.dirname, "..", "..", "..", "eslint.config.mjs");

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
    const calls = source.split("serve(").length - 1;
    assert.equal(
      exports.length,
      calls,
      `${file}: ${calls} serve( calls but ${exports.length} parsed exports; an export is formatted unexpectedly`,
    );
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

// The converted modules and their API directories, read from the ESLint config's text
// (MODULE_API_DIRS and CONVERTED_MODULES) so both guards use one list. Parsed rather than
// imported: importing the config would load ESLint and the Next presets.
function convertedApiDirs(): string[] {
  const config = readFileSync(ESLINT_CONFIG, "utf8");
  const dirsBlock = config.match(/const MODULE_API_DIRS = \{([^}]*)\};/);
  const convertedBlock = config.match(/const CONVERTED_MODULES = \[([^\]]*)\];/);
  assert.ok(dirsBlock && convertedBlock, "eslint.config.mjs: MODULE_API_DIRS or CONVERTED_MODULES not found");
  const strings = (text: string) => [...text.matchAll(/"([^"]+)"/g)].map((m) => m[1]);
  const dirsByModule = new Map(
    [...dirsBlock[1].matchAll(/([\w-]+):\s*\[([^\]]*)\]/g)].map((m) => [m[1], strings(m[2])]),
  );
  const converted = strings(convertedBlock[1]);
  assert.ok(converted.length > 0, "eslint.config.mjs: CONVERTED_MODULES is empty");
  return converted.flatMap((id) => {
    const dirs = dirsByModule.get(id);
    assert.ok(dirs && dirs.length > 0, `eslint.config.mjs: converted module ${id} has no MODULE_API_DIRS entry`);
    return dirs;
  });
}

const firstDir = (path: string) => path.split("/")[2]; // /api/<dir>/...

test("the converted modules' API directories are exactly the ones allRoutes serves", () => {
  assert.deepEqual(
    [...new Set(allRoutes.map((r) => firstDir(r.path)))].sort(),
    [...convertedApiDirs()].sort(),
  );
});

const IMPORT_SERVE = 'import { serve } from "@/lib/data/serve";';
const SERVE_LINE = /^export const (\w+) = serve\("(\w+)", "([^"]+)"\);$/;

test("every route file of a converted module holds only serve() exports", () => {
  const dirs = convertedApiDirs();
  let checked = 0;
  for (const file of routeFiles(API_DIR)) {
    if (!dirs.includes(firstDir(pathFor(file)))) continue;
    const lines = readFileSync(file, "utf8")
      .replace(/\/\*[\s\S]*?\*\//g, "")
      .split("\n")
      .map((line) => line.trim())
      .filter((line) => line !== "" && !line.startsWith("//"));
    const imports = lines.filter((line) => line.startsWith("import"));
    assert.deepEqual(imports, [IMPORT_SERVE], `${file}: the only import must be ${IMPORT_SERVE}`);
    const rest = lines.filter((line) => !line.startsWith("import"));
    const strays = rest.filter((line) => !SERVE_LINE.test(line));
    assert.deepEqual(strays, [], `${file}: only serve() exports are allowed`);
    assert.ok(rest.length > 0, `${file}: no serve() exports`);
    checked++;
  }
  assert.ok(checked > 0);
});

test("every route in allRoutes is served by the route file at its location", () => {
  for (const { method, path } of allRoutes) {
    const dirs = path.split("/").slice(2).map((d) => d.replace(/^:(.+)$/, "[$1]"));
    const file = join(API_DIR, ...dirs, "route.ts");
    assert.ok(existsSync(file), `${method} ${path}: no route file at ${relative(API_DIR, file)}`);
    const source = readFileSync(file, "utf8");
    assert.ok(
      source.includes(`export const ${method} = serve("${method}", "${path}");`),
      `${method} ${path}: ${relative(API_DIR, file)} does not export ${method} = serve("${method}", "${path}")`,
    );
  }
});
