import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { files, findDirectAccess } from "@/lib/data/test-support/direct-access";

test("Projects client code reaches data only through the request helper", () => {
  const roots = ["src/hooks/projects", "src/components/projects", "src/app/(app)/projects"].map((d) => join(process.cwd(), ...d.split("/")));
  const all = [...roots.flatMap(files), join(process.cwd(), "src", "components", "dashboard", "projects-card.tsx")];
  assert.ok(all.length >= 14, `scanned ${all.length} files`);
  const offenders = all.flatMap((f) => findDirectAccess(readFileSync(f, "utf8")).map((line) => `${f}:${line}`));
  assert.deepEqual(offenders, []);
  const hooks = files(roots[0]).filter((f) => /use-(projects|tasks|scratchpad)\.ts$/.test(f));
  assert.equal(hooks.length, 3);
  for (const hook of hooks) {
    const source = readFileSync(hook, "utf8");
    assert.match(source, /from "@\/hooks\/request"/, hook);
    assert.match(source, /NO_RETRY_ON_STATUS/, hook);
  }
});
