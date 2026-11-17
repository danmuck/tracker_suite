// Guards against a test file being emptied or losing all its tests without anyone noticing.

import { test } from "node:test";
import assert from "node:assert/strict";
import { readdirSync, readFileSync } from "node:fs";
import { join, relative } from "node:path";

function testFiles(dir: string): string[] {
  const out: string[] = [];
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const full = join(dir, entry.name);
    if (entry.isDirectory()) out.push(...testFiles(full));
    else if (entry.name.endsWith(".test.ts")) out.push(full);
  }
  return out;
}

test("every test file under src has content and at least one test( call", () => {
  const files = testFiles(join(process.cwd(), "src"));
  assert.ok(files.length > 5, `expected several test files, found ${files.length}`);
  const bad = files
    .filter((file) => {
      const source = readFileSync(file, "utf8");
      return source.trim() === "" || !/(^|[^\w.])test\(/m.test(source);
    })
    .map((file) => relative(process.cwd(), file));
  assert.deepEqual(bad, [], `empty or test-less test files: ${bad.join(", ")}`);
});
