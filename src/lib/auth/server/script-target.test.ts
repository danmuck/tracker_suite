import { test } from "node:test";
import assert from "node:assert/strict";
import { parseTarget } from "./script-target";

test("--db is required", () => {
  assert.throws(() => parseTarget([]), /--db/);
  assert.throws(() => parseTarget(["--apply"]), /--db/);
  assert.throws(() => parseTarget(["--db"]), /--db/);
  assert.throws(() => parseTarget(["--db", "--apply"]), /--db/);
});

test("a --uri that names another database is refused", () => {
  assert.throws(() => parseTarget(["--db", "x", "--uri", "mongodb://h/y"]), /refus/i);
  assert.throws(() => parseTarget(["--db", "tracker_scratch", "--uri", "mongodb://localhost:27017/test"]), /refus/i);
  assert.throws(() => parseTarget(["--db", "x", "--uri", "mongodb://h1:1,h2:2/y?replicaSet=r"]), /refus/i);
});

test("a --uri with no database in its path is refused", () => {
  assert.throws(() => parseTarget(["--db", "x", "--uri", "mongodb://h"]), /refus/i);
  assert.throws(() => parseTarget(["--db", "x", "--uri", "mongodb://h/"]), /refus/i);
  assert.throws(() => parseTarget(["--db", "x", "--uri", "mongodb://h/?a=b"]), /refus/i);
});

test("a --uri that names the same database is accepted", () => {
  const t = parseTarget(["--db", "x", "--uri", "mongodb://h1:1,h2:2/x?replicaSet=r"]);
  assert.equal(t.db, "x");
  assert.equal(t.uri, "mongodb://h1:1,h2:2/x?replicaSet=r");
});

test("the default URI is built from --db", () => {
  assert.deepEqual(parseTarget(["--db", "tracker_scratch"]), {
    db: "tracker_scratch",
    uri: "mongodb://localhost:27017/tracker_scratch",
    apply: false,
    rest: [],
  });
});

test("a database name that is not a plain name is refused", () => {
  assert.throws(() => parseTarget(["--db", "a/b"]), /--db/);
  assert.throws(() => parseTarget(["--db", "a?b"]), /--db/);
  assert.throws(() => parseTarget(["--db", "a b"]), /--db/);
});

test("--apply is parsed and unknown flags land in rest, in order", () => {
  const t = parseTarget(["--email", "a@b.c", "--db", "x", "--apply", "--name", "Ann"]);
  assert.equal(t.apply, true);
  assert.deepEqual(t.rest, ["--email", "a@b.c", "--name", "Ann"]);
});
