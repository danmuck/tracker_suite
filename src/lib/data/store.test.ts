import { test } from "node:test";
import assert from "node:assert/strict";
import { assertIdUnchanged, assertUpsertFilter } from "./store";

test("assertIdUnchanged rejects _id in $set, $setOnInsert, $unset and $inc", () => {
  for (const op of ["$set", "$setOnInsert", "$unset", "$inc"]) {
    assert.throws(() => assertIdUnchanged({ [op]: { _id: "x" } }), { message: "_id cannot be changed" });
  }
  assertIdUnchanged({ $set: { name: "a" }, $setOnInsert: { order: 0 } });
});

test("assertUpsertFilter accepts no _id, a valid id or an operator, and rejects anything else", () => {
  assertUpsertFilter({ slug: "s" });
  assertUpsertFilter({ _id: "a".repeat(24) });
  assertUpsertFilter({ _id: { $in: ["a".repeat(24)] } });
  for (const bad of ["xyz", "A".repeat(24), "a".repeat(23), 5, null]) {
    assert.throws(() => assertUpsertFilter({ _id: bad }), { message: "Invalid _id" });
  }
});
