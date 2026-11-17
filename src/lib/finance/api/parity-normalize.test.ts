// Tests for the Finance parity tooling: the transcript normalizer, the scenario builder and the order check.

import { test } from "node:test";
import assert from "node:assert/strict";
import { compareTranscripts, createNormalizer, dayOrderConflicts, substitute } from "../../../../scripts/finance-parity/normalize";
import { buildScenario, type Step } from "../../../../scripts/finance-parity/scenario";

const A = "a".repeat(24), B = "b".repeat(24), C = "c".repeat(24);

test("normalizer: aliases ids, sorts keys, drops createdAt and __v, marks updatedAt", () => {
  const n = createNormalizer(() => ({ checking: A }));
  assert.equal(
    JSON.stringify(n({ name: "x", _id: A, __v: 0, createdAt: "c", updatedAt: "2026-01-01T10:00:00.000Z", linked: B, when: "2026-01-01T00:00:00.000Z" })),
    '{"_id":"<checking>","linked":"<id:1>","name":"x","updatedAt":"<new>","when":"2026-01-01T00:00:00.000Z"}',
  );
  assert.deepEqual(n({ _id: A, updatedAt: "2026-01-01T10:00:00.000Z" }), { _id: "<checking>", updatedAt: "<same>" });
  assert.deepEqual(n({ _id: A, updatedAt: "2026-01-01T10:00:05.000Z" }), { _id: "<checking>", updatedAt: "<changed>" });
  assert.deepEqual(n({ date: "2026-01-01T10:00:05.123Z", balances: { [C]: 5, [B]: 1 } }), { balances: { "<id:1>": 1, "<id:2>": 5 }, date: "<instant>" });
  assert.deepEqual(n({ updatedAt: "x", a: 1 }), { a: 1 });
});

test("normalizer: dataVersion keeps counts and balances, marks each timestamp", () => {
  const n = createNormalizer(() => ({ checking: A, savings: B }));
  assert.deepEqual(n({ dataVersion: `3|1000|0|${B}:500:20,${A}:100:10` }), { dataVersion: "3|<new>|<new>|<checking>:100:<new>,<savings>:500:<new>" });
  assert.deepEqual(n({ dataVersion: `3|1000|0|${A}:100:10,${B}:700:25` }), { dataVersion: "3|<same>|<same>|<checking>:100:<same>,<savings>:700:<changed>" });
});

test("substitute fills {name} in strings and in object keys", () => {
  assert.deepEqual(substitute({ path: "/x/{a}", edited: { "{a}": { id: "{a}" } }, n: 1 }, { a: A }), { path: `/x/${A}`, edited: { [A]: { id: A } }, n: 1 });
});

test("compareTranscripts: equal passes; an allowed step compares status and error only; anything else is reported", () => {
  const steps = [
    { id: "S1", method: "GET", path: "/a", expect: 200 },
    { id: "S2", method: "GET", path: "/a/abc", expect: 500, allow: { rule: "D1a", status: 404, error: "Account not found" } },
  ] as Step[];
  const meta = { capturedAt: "", localDate: "", timeZone: "", commit: "" };
  const golden = { meta, finalBalances: { Cash: 0 }, steps: [{ id: "S1", request: "GET /a", status: 200, body: [1] }, { id: "S2", request: "GET /a/abc", status: 500, body: { error: "Failed to fetch account" } }] };
  const after = { meta, finalBalances: { Cash: 0 }, steps: [golden.steps[0], { id: "S2", request: "GET /a/abc", status: 404, body: { error: "Account not found" } }] };
  assert.deepEqual(compareTranscripts(golden, after, steps), []);
  assert.equal(compareTranscripts(golden, golden, steps).length, 1); // S2 did not change to the allowed result
  assert.equal(compareTranscripts(golden, { ...after, finalBalances: { Cash: 1 } }, steps).length, 1);
  assert.equal(compareTranscripts(golden, { ...after, steps: [{ ...golden.steps[0], body: [2] }, after.steps[1]] }, steps).length, 1);
});

test("scenario: unique step ids, relative dates, distinct amounts and dates among created transactions", () => {
  const steps = buildScenario("2026-11-17");
  assert.equal(new Set(steps.map((s) => s.id)).size, steps.length);
  assert.equal(steps.length, 170);
  const created = steps.filter((s) => s.method === "POST" && s.path === "/api/transactions" && s.expect === 201).map((s) => s.body as { amount: number; date: string });
  assert.equal(new Set(created.map((b) => b.amount)).size, created.length);
  assert.equal(new Set(created.map((b) => b.date)).size, created.length);
  assert.equal((steps.find((s) => s.id === "T09")!.body as { date: string }).date, "2026-11-18");
  assert.equal((steps.find((s) => s.id === "T13")!.body as { date: string }).date, "2026-09-01");
  assert.equal(steps.filter((s) => s.allow?.rule === "D1a").length, 8);
  assert.equal(steps.filter((s) => s.allow?.rule === "D1c").length, 8);
  assert.deepEqual(buildScenario("2026-11-17"), buildScenario("2026-11-17"));
});

test("scenario: recurring transactions from the checking account are created in descending stored-date order", () => {
  for (const today of ["2026-11-17", "2026-12-01", "2027-01-31", "2027-03-15"]) {
    const steps = buildScenario(today);
    const stored = (id: string) => {
      const b = steps.find((s) => s.id === id)!.body as { date?: string; startDate?: string };
      return b.date ?? b.startDate!;
    };
    const dates = ["T09", "T12", "T13", "T15", "T16", "P05", "P11"].map(stored);
    assert.deepEqual(dates, [...dates].sort().reverse(), today);
    assert.equal(new Set(dates).size, dates.length, today);
  }
});

test("order check: a day whose same-kind entries are in creation order but not stored-date-descending order is reported", () => {
  const created = [{ _id: "x", date: "2026-08-01T00:00:00.000Z" }, { _id: "y", date: "2026-09-01T00:00:00.000Z" }];
  const day = (ids: string[]) => ({ date: "2026-12-01", transactions: ids.map((id) => ({ sourceTransactionId: id, isRecurring: true })) });
  assert.equal(dayOrderConflicts([day(["x", "y"])], created).length, 1);
  assert.deepEqual(dayOrderConflicts([day(["y"]), day(["x"])], created), []);
  assert.deepEqual(dayOrderConflicts([day(["y", "x"])], [created[1], created[0]]), []);
  // A weekly or monthly bucket lists its days in date order: entries on different days are not compared
  const bucket = { date: "2026-12-01", transactions: [{ sourceTransactionId: "x", isRecurring: true, date: "2026-12-01" }, { sourceTransactionId: "y", isRecurring: true, date: "2026-12-02" }] };
  assert.deepEqual(dayOrderConflicts([bucket], created), []);
});
