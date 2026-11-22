// Run after the static export: writes out/_headers (see src/lib/deploy/static-headers.ts)
// and removes source maps. Usage: node … scripts/static-headers.ts [exportDir]

import { readdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { join, relative } from "node:path";
import { buildHeaders, type Page } from "../src/lib/deploy/static-headers";

const dir = process.argv[2] ?? "out";

function walk(d: string): string[] {
  return readdirSync(d, { withFileTypes: true }).flatMap((e) =>
    e.isDirectory() ? walk(join(d, e.name)) : [join(d, e.name)],
  );
}

const files = walk(dir);
for (const f of files.filter((f) => f.endsWith(".map"))) rmSync(f);

const pages: Page[] = files
  .filter((f) => f.endsWith(".html"))
  .map((f) => ({ file: relative(dir, f), html: readFileSync(f, "utf8") }));

writeFileSync(join(dir, "_headers"), buildHeaders(pages));
console.log(`Wrote ${join(dir, "_headers")} for ${pages.length} pages`);
