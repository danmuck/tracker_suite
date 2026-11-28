import { test } from "node:test";
import assert from "node:assert/strict";
import { normalizePassword, passwordProblem } from "./password-rules";

test("length is checked from 12 to 128 characters", () => {
  assert.notEqual(passwordProblem("mangoglacie"), null);
  assert.equal(passwordProblem("mangoglacier"), null);
  assert.equal(passwordProblem("ab".repeat(64)), null);
  assert.notEqual(passwordProblem("ab".repeat(64) + "c"), null);
});

test("length counts code points, not UTF-16 units", () => {
  const twelveEmoji = "😀😃😄😁😆😅🤣😂🙂🙃😉😊";
  assert.equal(twelveEmoji.length, 24);
  assert.equal(passwordProblem(twelveEmoji), null);
  assert.notEqual(passwordProblem(twelveEmoji.slice(0, -2)), null);
});

test("one repeated character is refused", () => {
  assert.notEqual(passwordProblem("aaaaaaaaaaaa"), null);
});

test("common passwords are refused in any case", () => {
  assert.notEqual(passwordProblem("password1234"), null);
  assert.notEqual(passwordProblem("PassWord1234"), null);
});

test("the email local part is refused when it is 4 or more characters", () => {
  const context = { email: "danny@example.com" };
  assert.notEqual(passwordProblem("danny-likes-tea", context), null);
  assert.notEqual(passwordProblem("DANNY-likes-tea", context), null);
  assert.equal(passwordProblem("danny-likes-tea"), null);
  assert.equal(passwordProblem("mangoglacier", { email: "abc@example.com" }), null);
  assert.equal(passwordProblem("mangoabcglacier", { email: "abc@example.com" }), null);
});

test("an unrelated passphrase is accepted", () => {
  assert.equal(passwordProblem("mango glacier lamp", { email: "danny@example.com" }), null);
});

test("normalizePassword is NFKC: composed, decomposed and full-width forms agree", () => {
  assert.equal(normalizePassword("caf\u0065\u0301"), "caf\u00e9");
  assert.equal(normalizePassword("caf\u00e9"), "caf\u00e9");
  assert.equal(normalizePassword("\uff50\uff41\uff53\uff53"), "pass");
});

test("length rules count the normalised password", () => {
  const decomposed = "e\u0301".repeat(6); // 12 code points typed, 6 after composing
  assert.equal(Array.from(decomposed).length, 12);
  assert.notEqual(passwordProblem(decomposed + "abcde"), null);
  const ligatures = "\ufb01".repeat(5) + "xy"; // 7 typed, "fi" x5 + "xy" = 12 after NFKC
  assert.equal(passwordProblem(ligatures), null);
});

test("the other rules also see the normalised password", () => {
  const fullWidthCommon = Array.from("password1234", (c) => String.fromCodePoint(c.codePointAt(0)! + 0xfee0)).join("");
  assert.notEqual(normalizePassword(fullWidthCommon), fullWidthCommon);
  assert.notEqual(passwordProblem(fullWidthCommon), null);
});
