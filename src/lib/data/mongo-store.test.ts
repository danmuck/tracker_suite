// Covers only what the Mongo store decides before reaching the database; no connection is opened.

import { test } from "node:test";
import assert from "node:assert/strict";
import { duplicateKeyField, mongoStore } from "./mongo-store";

test("updates that change _id reject before reaching Mongoose, with the browser store's message", async () => {
  const groups = mongoStore.collection("linkGroups");
  const id = "a".repeat(24);
  const idChanged = { message: "_id cannot be changed" };
  await assert.rejects(groups.updateById(id, { $set: { _id: "b".repeat(24) } }), idChanged);
  await assert.rejects(groups.updateOne({ _id: id }, { $unset: { _id: 1 } }), idChanged);
  await assert.rejects(groups.updateMany({}, { $inc: { _id: 1 } }), idChanged);
  await assert.rejects(groups.batchUpdate([{ filter: {}, update: { $set: { _id: id } } }]), idChanged);
});

test("duplicateKeyField reads keyPattern, else a bulkWrite error's errmsg, else unknown", () => {
  assert.equal(duplicateKeyField({ keyPattern: { slug: 1 } }), "slug");
  // The shape mongodb 7.0.0 throws from bulkWrite: no keyPattern anywhere, only the message.
  const bulk = {
    writeErrors: [
      {
        errmsg:
          'Plan executor error during update :: caused by :: E11000 duplicate key error collection: db.linkgroups index: slug_1 dup key: { slug: "a" }',
      },
    ],
  };
  assert.equal(duplicateKeyField(bulk), "slug");
  assert.equal(duplicateKeyField({ writeErrors: [{ errmsg: "something else" }] }), "unknown");
  assert.equal(duplicateKeyField({}), "unknown");
});

test("upserts with _id in $setOnInsert or an invalid filter _id reject before reaching Mongoose", async () => {
  const groups = mongoStore.collection("linkGroups");
  await assert.rejects(
    groups.updateOne({ slug: "s" }, { $setOnInsert: { _id: "a".repeat(24) } }, { upsert: true }),
    { message: "_id cannot be changed" },
  );
  await assert.rejects(groups.updateOne({ _id: "xyz" }, { $set: { name: "x" } }, { upsert: true }), {
    message: "Invalid _id",
  });
});
