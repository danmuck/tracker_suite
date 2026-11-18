import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { files, findDirectAccess } from "@/lib/data/test-support/direct-access";

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
