import { test } from "node:test";
import assert from "node:assert/strict";
import { requestSave, saveFailed, saveSucceeded, startSync } from "./scratchpad-sync";

test("an untouched editor never saves: the loaded content is skipped", () => {
  const s = startSync("hello");
  assert.equal(requestSave(s, "hello").save, null);
  assert.equal(requestSave(startSync(""), "").save, null);
});

test("a change is saved once; the same value again is skipped; going back to the loaded text is saved", () => {
  let s = startSync("hello");
  const first = requestSave(s, "hello world");
  assert.deepEqual(first.save, { seq: 1, value: "hello world" });
  s = first.state;
  // Debounce then blur with the same text: one write
  assert.equal(requestSave(s, "hello world").save, null);
  // Back to the loaded text while "hello world" is (or will be) on the server: it must be sent
  assert.deepEqual(requestSave(s, "hello").save, { seq: 2, value: "hello" });
});

test("answers in order are applied; an older answer resolving last is not", () => {
  let s = startSync("a");
  let r = requestSave(s, "ab");
  s = r.state;
  r = requestSave(s, "abc");
  s = r.state;
  // Save 2 ("abc") answers first, then save 1 ("ab")
  let done = saveSucceeded(s, 2);
  assert.equal(done.apply, true);
  s = done.state;
  done = saveSucceeded(s, 1);
  assert.equal(done.apply, false);
  assert.deepEqual(done.state, s);
  // In order: both applied
  let t = requestSave(startSync("a"), "ab").state;
  t = requestSave(t, "abc").state;
  assert.equal(saveSucceeded(t, 1).apply, true);
  assert.equal(saveSucceeded(saveSucceeded(t, 1).state, 2).apply, true);
});

test("a failed latest save makes the next request go out even with the same text", () => {
  let s = requestSave(startSync(""), "notes").state;
  s = saveFailed(s, 1);
  assert.equal(s.sent, null);
  assert.deepEqual(requestSave(s, "notes").save, { seq: 2, value: "notes" });
});

test("a failed older save is covered by the newer one", () => {
  let s = requestSave(startSync(""), "a").state;
  s = requestSave(s, "ab").state;
  const after = saveFailed(s, 1);
  assert.deepEqual(after, s);
  assert.equal(requestSave(after, "ab").save, null);
});
