import { test } from "node:test";
import assert from "node:assert/strict";
import { generateRecoveryCodes, hashRecoveryCode } from "./recovery-codes.ts";

const SHAPE = /^([0-9A-HJKMNP-TV-Z]{4}-){3}[0-9A-HJKMNP-TV-Z]{4}$/;

test("ten distinct codes in the XXXX-XXXX-XXXX-XXXX shape with 64-hex hashes", () => {
  const { codes, hashes } = generateRecoveryCodes();
  assert.equal(codes.length, 10);
  assert.equal(hashes.length, 10);
  assert.equal(new Set(codes).size, 10);
  for (const code of codes) assert.match(code, SHAPE);
  for (const hash of hashes) assert.match(hash, /^[0-9a-f]{64}$/);
});

test("a code matches its stored hash however it is typed", () => {
  const { codes, hashes } = generateRecoveryCodes();
  codes.forEach((code, i) => {
    assert.equal(hashRecoveryCode(code), hashes[i]);
    assert.equal(hashRecoveryCode(code.toLowerCase()), hashes[i]);
    assert.equal(hashRecoveryCode(code.replaceAll("-", "")), hashes[i]);
    assert.equal(hashRecoveryCode(code.replaceAll("-", " ")), hashes[i]);
    assert.equal(hashRecoveryCode(` ${code} `), hashes[i]);
  });
});

test("O, I and L stand in for 0 and 1", () => {
  assert.equal(hashRecoveryCode("0O01-1I1L-ABCD-EFGH"), hashRecoveryCode("0001-1111-ABCD-EFGH"));
  assert.equal(hashRecoveryCode("oil0"), hashRecoveryCode("0110"));
});

test("different codes hash differently", () => {
  assert.notEqual(hashRecoveryCode("0000-0000-0000-0000"), hashRecoveryCode("0000-0000-0000-0001"));
});
