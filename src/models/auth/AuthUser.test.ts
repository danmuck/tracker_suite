// Inspects the schema only; no database connection is opened.

import { test } from "node:test";
import assert from "node:assert/strict";
import AuthUser from "./AuthUser";

test("the password hash and recovery codes are not selected unless asked for", () => {
  assert.equal(AuthUser.schema.path("passwordHash").options.select, false);
  assert.equal(AuthUser.schema.path("recoveryCodes").options.select, false);
  assert.notEqual(AuthUser.schema.path("email").options.select, false);
  assert.notEqual(AuthUser.schema.path("role").options.select, false);
});

test("email is unique", () => {
  assert.equal(AuthUser.schema.path("email").options.unique, true);
});
