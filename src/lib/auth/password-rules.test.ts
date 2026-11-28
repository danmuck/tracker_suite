import { test } from "node:test";
import assert from "node:assert/strict";
import { passwordProblem } from "./password-rules";

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
