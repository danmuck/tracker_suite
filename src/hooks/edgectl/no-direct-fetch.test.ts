import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { files, findDirectAccess } from "@/lib/data/test-support/direct-access";

test("edgectl client code reaches data only through the request helper", () => {
  const roots = ["src/hooks/edgectl", "src/components/edgectl", "src/app/(app)/edgectl"].map((d) =>
    join(process.cwd(), ...d.split("/")),
  );
  const all = [...roots.flatMap(files), join(process.cwd(), "src", "components", "dashboard", "edgectl-card.tsx")];
  assert.ok(all.length >= 18, `scanned ${all.length} files`);
  const offenders = all.flatMap((f) => findDirectAccess(readFileSync(f, "utf8")).map((line) => `${f}:${line}`));
  assert.deepEqual(offenders, []);
  const hooks = files(roots[0]).filter((f) => /use-[\w-]+\.ts$/.test(f));
  assert.equal(hooks.length, 6);
  for (const hook of hooks) {
    const source = readFileSync(hook, "utf8");
    assert.match(source, /from "@\/hooks\/request"/, hook);
    assert.match(source, /NO_RETRY_ON_STATUS/, hook);
  }
});

test("edgectl client code never names Mirage's address or the operator certificate", () => {
  const roots = ["src/hooks/edgectl", "src/components/edgectl", "src/app/(app)/edgectl", "src/lib/edgectl"].map((d) =>
    join(process.cwd(), ...d.split("/")),
  );
  const serverDir = join(process.cwd(), "src", "lib", "edgectl", "server");
  for (const file of roots.flatMap(files).filter((f) => !f.startsWith(serverDir))) {
    const source = readFileSync(file, "utf8");
    assert.doesNotMatch(source, /process\.env\.EDGECTL|node:https|node:fs/, file);
  }
});
