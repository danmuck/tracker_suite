import { test } from "node:test";
import assert from "node:assert/strict";
import { isNavItemActive, moduleForPath, moduleHome, modules } from "./modules";

function activeLabels(pathname: string): string[] {
  const mod = moduleForPath(pathname);
  assert.ok(mod, `no module for ${pathname}`);
  return mod.navItems.filter((item) => isNavItemActive(mod, item, pathname)).map((item) => item.label);
}

test("a page belongs to the module whose base path it is under", () => {
  assert.equal(moduleForPath("/finance")?.id, "finance");
  assert.equal(moduleForPath("/finance/accounts/abc")?.id, "finance");
  assert.equal(moduleForPath("/dashboard"), undefined);
  assert.equal(moduleForPath("/financeish"), undefined);
});

test("the section at a module's base path owns only that page", () => {
  assert.deepEqual(activeLabels("/finance"), ["Dashboard"]);
  assert.deepEqual(activeLabels("/finance/accounts"), ["Accounts"]);
  assert.deepEqual(activeLabels("/finance/accounts/abc"), ["Accounts"]);
});

test("a detail page lights the section it belongs to, and only that one", () => {
  assert.deepEqual(activeLabels("/edgectl/ghost"), ["Ghosts"]);
  assert.deepEqual(activeLabels("/edgectl/ghosts"), ["Ghosts"]);
  assert.deepEqual(activeLabels("/edgectl/intent"), ["Intents"]);
  assert.deepEqual(activeLabels("/edgectl/dependency"), ["Dependencies"]);
  assert.deepEqual(activeLabels("/edgectl"), ["Overview"]);
});

test("no page lights two sections", () => {
  for (const mod of modules) {
    for (const item of mod.navItems) {
      for (const path of [item.href, ...(item.also ?? [])]) {
        assert.equal(activeLabels(path).length, 1, path);
      }
    }
  }
});

test("a module opens on its first section, or its base path when it has none", () => {
  const byId = Object.fromEntries(modules.map((mod) => [mod.id, moduleHome(mod)]));
  assert.equal(byId.figure, "/figure/fitness");
  assert.equal(byId.future, "/future/apartments");
  assert.equal(byId.links, "/links");
});
