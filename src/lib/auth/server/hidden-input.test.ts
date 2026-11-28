import { test } from "node:test";
import assert from "node:assert/strict";
import { feedHidden, startHidden, type HiddenFeed } from "./hidden-input";

/** Feeds the chunks in order and returns the first result that is not "reading", or the last one. */
function run(...chunks: string[]): HiddenFeed {
  let reader = startHidden();
  let last: HiddenFeed = { status: "reading", reader };
  for (const chunk of chunks) {
    last = feedHidden(reader, chunk);
    if (last.status !== "reading") return last;
    reader = last.reader;
  }
  return last;
}

test("typed characters accumulate until Enter", () => {
  assert.deepEqual(run("mango", " glacier", "\r"), { status: "done", value: "mango glacier", rest: "" });
  assert.deepEqual(run("abc\n"), { status: "done", value: "abc", rest: "" });
});

test("nothing is done until a newline arrives", () => {
  const r = run("abc");
  assert.equal(r.status, "reading");
  if (r.status === "reading") assert.equal(r.reader.value, "abc");
});

test("backspace deletes one code point, not one UTF-16 unit", () => {
  assert.deepEqual(run("ab😀\u007f\r"), { status: "done", value: "ab", rest: "" });
  assert.deepEqual(run("ab\b\bc\r"), { status: "done", value: "c", rest: "" });
  assert.deepEqual(run("\u007f\u007fx\r"), { status: "done", value: "x", rest: "" });
});

test("escape sequences (arrows, function keys, alt-keys, paste brackets) add nothing", () => {
  assert.deepEqual(run("a\u001b[Ab\u001b[1;5Cc\u001bOPd\u001bxe\r"), { status: "done", value: "abcde", rest: "" });
  assert.deepEqual(run("\u001b[200~pasted\u001b[201~\r"), { status: "done", value: "pasted", rest: "" });
  assert.deepEqual(run("a\u001b[3~b\r"), { status: "done", value: "ab", rest: "" });
});

test("an escape sequence split across chunks is still swallowed", () => {
  assert.deepEqual(run("a\u001b", "[", "1;2", "Db\r"), { status: "done", value: "ab", rest: "" });
});

test("Ctrl-C cancels at any point", () => {
  assert.deepEqual(run("abc\u0003def\r"), { status: "cancelled" });
  assert.deepEqual(run("\u0003"), { status: "cancelled" });
});

test("Ctrl-D cancels on an empty line and is ignored otherwise", () => {
  assert.deepEqual(run("\u0004"), { status: "cancelled" });
  assert.deepEqual(run("ab\u0004c\r"), { status: "done", value: "abc", rest: "" });
});

test("other control characters add nothing", () => {
  assert.deepEqual(run("a\tb\u0001c\r"), { status: "done", value: "abc", rest: "" });
});

test("a pasted chunk with a newline ends the line there and keeps the rest", () => {
  assert.deepEqual(run("first\rsecond\r"), { status: "done", value: "first", rest: "second\r" });
  assert.deepEqual(run("first\r\nsecond"), { status: "done", value: "first", rest: "second" });
  assert.deepEqual(run("first\nsecond"), { status: "done", value: "first", rest: "second" });
});

test("the rest fed to a new reader gives the second line", () => {
  const first = run("one-pass\rone-pass\r");
  assert.equal(first.status, "done");
  if (first.status !== "done") return;
  assert.deepEqual(feedHidden(startHidden(), first.rest), { status: "done", value: "one-pass", rest: "" });
});

test("non-ASCII characters are kept", () => {
  assert.deepEqual(run("café 😀\r"), { status: "done", value: "café 😀", rest: "" });
});
