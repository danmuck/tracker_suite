import { test } from "node:test";
import assert from "node:assert/strict";
import { optionalField } from "./form-fields";

test("a value is sent as is", () => {
  assert.equal(optionalField("notes", undefined), "notes");
  assert.equal(optionalField("new", "old"), "new");
});

test("a field that had a value and is now empty sends the clear (\"\")", () => {
  assert.equal(optionalField("", "https://example.com/r"), "");
  assert.equal(optionalField("", "2026-11-18"), "");
});

test("a field that was never set and is empty is left out", () => {
  for (const before of [undefined, null, ""]) assert.equal(optionalField("", before), undefined);
});
