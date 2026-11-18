import { test } from "node:test";
import assert from "node:assert/strict";
import { projectSchema } from "./validators";

test("repository URL must be a web address or empty", () => {
  const ok = (repositoryUrl: string) => projectSchema.safeParse({ name: "p", repositoryUrl }).success;
  assert.equal(ok("javascript:alert(1)"), false);
  assert.equal(ok("https://github.com/x/y"), true);
  assert.equal(ok(""), true);
});
