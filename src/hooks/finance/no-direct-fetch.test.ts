import { test } from "node:test";
import assert from "node:assert/strict";
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";

function files(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((e) =>
    e.isDirectory() ? files(join(dir, e.name)) : /\.tsx?$/.test(e.name) && !e.name.endsWith(".test.ts") ? [join(dir, e.name)] : [],
  );
}

test("Finance client code reaches data only through the request helper", () => {
  const roots = ["src/hooks/finance", "src/components/finance", "src/app/(app)/finance", "src/components/dashboard"].map((d) => join(process.cwd(), ...d.split("/")));
  const all = roots.flatMap(files);
  assert.ok(all.length > 20);
  const offenders = all.filter((f) => /(^|[^.\w])fetch\(/.test(readFileSync(f, "utf8")));
  assert.deepEqual(offenders, []);
  for (const hook of files(roots[0]).filter((f) => /use-(accounts|transactions|categories|finance-profile|payment-plan|projections|summary)\.ts$/.test(f))) {
    assert.match(readFileSync(hook, "utf8"), /from "@\/hooks\/request"/, hook);
  }
});
