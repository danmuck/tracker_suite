import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { files, findDirectAccess } from "@/lib/data/test-support/direct-access";

test("Figure client code reaches data only through the request helper", () => {
  const roots = ["src/hooks/figure", "src/components/figure", "src/app/(app)/figure"].map((d) => join(process.cwd(), ...d.split("/")));
  const all = [...roots.flatMap(files), join(process.cwd(), "src", "components", "dashboard", "figure-card.tsx")];
  assert.ok(all.length >= 22, `scanned ${all.length} files`);
  const offenders = all.flatMap((f) => findDirectAccess(readFileSync(f, "utf8")).map((line) => `${f}:${line}`));
  assert.deepEqual(offenders, []);
  const hooks = files(roots[0]);
  assert.equal(hooks.length, 6);
  for (const hook of hooks) {
    const source = readFileSync(hook, "utf8");
    assert.match(source, /from "@\/hooks\/request"/, hook);
    // Every useSWR call passes the no-retry-on-status options
    const calls = source.match(/useSWR</g)?.length ?? 0;
    const guarded = source.match(/fetcher,\s*(\{\s*\.\.\.)?NO_RETRY_ON_STATUS\b/g)?.length ?? 0;
    assert.ok(calls > 0 && guarded >= calls, `${hook}: ${calls} useSWR, ${guarded} NO_RETRY_ON_STATUS`);
  }
});
