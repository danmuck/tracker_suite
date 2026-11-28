import { test } from "node:test";
import assert from "node:assert/strict";
import { hash as argonHash } from "@node-rs/argon2";
import { DUMMY_HASH, hashPassword, needsRehash, verifyPassword } from "./password.ts";

const PASSWORD = "correct horse battery";

test("hash and verify round trip, with the Argon2id parameters", async () => {
  const hash = await hashPassword(PASSWORD);
  assert.ok(hash.startsWith("$argon2id$"));
  assert.ok(hash.includes("m=65536,t=3,p=1"));
  assert.equal(await verifyPassword(hash, PASSWORD), true);
  assert.equal(await verifyPassword(hash, "another horse battery"), false);
  assert.notEqual(await hashPassword(PASSWORD), hash);
  assert.equal(needsRehash(hash), false);
});

test("a malformed hash verifies as false without throwing", async () => {
  assert.equal(await verifyPassword("not-a-hash", PASSWORD), false);
  assert.equal(await verifyPassword("", PASSWORD), false);
});

test("needsRehash flags weaker or unparseable hashes", async () => {
  const weak = await argonHash(PASSWORD, { memoryCost: 19456, timeCost: 3, parallelism: 1 });
  assert.ok(weak.startsWith("$argon2id$"));
  assert.ok(weak.includes("m=19456"));
  assert.equal(needsRehash(weak), true);
  assert.equal(needsRehash("not-a-hash"), true);
  assert.equal(needsRehash("$argon2i$v=19$m=65536,t=3,p=1$c2FsdHNhbHQ$aGFzaGhhc2g"), true);
});

test("the dummy hash is a real hash that matches no known password", async () => {
  const dummy = await DUMMY_HASH;
  assert.ok(dummy.startsWith("$argon2id$"));
  assert.equal(await verifyPassword(dummy, PASSWORD), false);
});
