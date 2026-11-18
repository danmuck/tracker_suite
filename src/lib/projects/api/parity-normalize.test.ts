// Tests for the Projects parity tooling: the transcript normalizer, the list-order check, the
// comparison (with allowed differences) and the scenario builder.

import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { compareTranscripts, createNormalizer, orderCheck, substitute, type Transcript } from "../../../../scripts/projects-parity/normalize";
import { buildScenario, UNKNOWN_ID, type Step } from "../../../../scripts/projects-parity/scenario";

const A = "a".repeat(24), B = "b".repeat(24), C = "c".repeat(24);

test("normalizer: aliases ids, sorts keys, drops __v, marks createdAt and updatedAt, keeps client dates", () => {
  const n = createNormalizer(() => ({ p1: A }));
  assert.equal(
    JSON.stringify(n({ title: "x", _id: B, __v: 0, createdAt: "c", projectId: A, updatedAt: "2026-01-01T10:00:00.000Z", dueDate: "2026-12-24T15:30:00.000Z" })),
    '{"_id":"<id:1>","createdAt":"<new>","dueDate":"2026-12-24T15:30:00.000Z","projectId":"<p1>","title":"x","updatedAt":"<new>"}',
  );
  assert.deepEqual(n({ _id: B, createdAt: "c", updatedAt: "2026-01-01T10:00:00.000Z" }), { _id: "<id:1>", createdAt: "<same>", updatedAt: "<same>" });
  assert.deepEqual(n([{ _id: C }, { _id: B, updatedAt: "2026-01-01T10:00:01.000Z" }]), [{ _id: "<id:2>" }, { _id: "<id:1>", updatedAt: "<changed>" }]);
  // A createdAt rewritten by an update or upsert is flagged
  assert.deepEqual(n({ _id: B, createdAt: "d" }), { _id: "<id:1>", createdAt: "<changed>" });
  // createdAt and updatedAt are tracked separately: the first createdAt of a seen document is <new>
  assert.deepEqual(n({ _id: C, createdAt: "e", updatedAt: "u" }), { _id: "<id:2>", createdAt: "<new>", updatedAt: "<new>" });
  // createdAt / updatedAt without an _id are dropped
  assert.deepEqual(n({ createdAt: "x", a: 1 }), { a: 1 });
  assert.deepEqual(n({ updatedAt: "x", a: 1 }), { a: 1 });
});

test("substitute is Finance's", () => {
  assert.deepEqual(substitute({ projectId: "{p1}" }, { p1: A }), { projectId: A });
});

const tasksStep = (ties?: true): Step => ({ id: "S", method: "GET", path: "/api/tasks?projectId=x", expect: 200, ...(ties ? { ties } : {}) });

test("order check: task lists must be in (status, order) order without ties", () => {
  const ok = [{ status: "backlog", order: 0 }, { status: "backlog", order: 3 }, { status: "done", order: 0 }, { status: "todo", order: 1 }];
  assert.deepEqual(orderCheck(tasksStep(), "/api/tasks?projectId=x", ok).problems, []);
  const tied = [{ _id: "y", status: "backlog", order: 0, title: "b" }, { _id: "z", status: "backlog", order: 0, title: "a" }];
  assert.match(orderCheck(tasksStep(), "/api/tasks?projectId=x", tied).problems.join(), /tie on \(status, order\)/);
  const unsorted = [{ status: "todo", order: 0 }, { status: "done", order: 0 }];
  assert.match(orderCheck(tasksStep(), "/api/tasks?projectId=x", unsorted).problems.join(), /not in \(status, order\) order/);
  // A non-200 body or another route is left alone
  assert.deepEqual(orderCheck(tasksStep(), "/api/tasks", { error: "x" }), { body: { error: "x" }, problems: [] });
});

test("order check: a `ties` step must hold a tie, and tied runs are ordered by title", () => {
  const tied = [{ status: "backlog", order: 0, title: "b" }, { status: "backlog", order: 0, title: "a" }, { status: "todo", order: 0, title: "0" }];
  const result = orderCheck(tasksStep(true), "/api/tasks?projectId=x", tied);
  assert.deepEqual(result.problems, []);
  assert.deepEqual((result.body as { title: string }[]).map((t) => t.title), ["a", "b", "0"]);
  assert.match(orderCheck(tasksStep(true), "/api/tasks?projectId=x", [tied[0], tied[2]]).problems.join(), /holds no tie/);
});

test("order check: project lists must be createdAt-descending without ties", () => {
  const step: Step = { id: "S", method: "GET", path: "/api/projects", expect: 200 };
  const t = (s: number) => `2026-01-01T10:00:0${s}.000Z`;
  assert.deepEqual(orderCheck(step, "/api/projects", [{ createdAt: t(2) }, { createdAt: t(1) }]).problems, []);
  assert.match(orderCheck(step, "/api/projects?status=active", [{ createdAt: t(1) }, { createdAt: t(1) }]).problems.join(), /tie on createdAt/);
  assert.match(orderCheck(step, "/api/projects", [{ createdAt: t(1) }, { createdAt: t(2) }]).problems.join(), /descending/);
});

test("compareTranscripts: exact match, or an allowed step answering exactly its allowed result", () => {
  const steps = [
    { id: "S1", method: "GET", path: "/a", expect: 200 },
    { id: "S2", method: "GET", path: "/a/abc", expect: 500, allow: { rule: "D1a", status: 404, error: "Project not found" } },
  ] as Step[];
  const meta = { capturedAt: "", commit: "" };
  const today: Transcript = {
    meta,
    steps: [
      { id: "S1", request: "GET /a", status: 200, body: [1] },
      { id: "S2", request: "GET /a/abc", status: 500, body: { error: "Failed to fetch project" } },
    ],
  };
  const converted: Transcript = { meta, steps: [today.steps[0], { id: "S2", request: "GET /a/abc", status: 404, body: { error: "Project not found" } }] };
  assert.deepEqual(compareTranscripts(today, today, steps), { diffs: [], allowed: [] });
  // Today's golden accepts the converted answer as an allowed difference
  const r = compareTranscripts(today, converted, steps);
  assert.deepEqual(r.diffs, []);
  assert.equal(r.allowed.length, 1);
  // …but nothing else: another status, or the allowed status with another error
  assert.equal(compareTranscripts(today, { meta, steps: [today.steps[0], { ...converted.steps[1], status: 400 }] }, steps).diffs.length, 1);
  assert.equal(compareTranscripts(today, { meta, steps: [today.steps[0], { ...converted.steps[1], body: { error: "x" } }] }, steps).diffs.length, 1);
  // A re-recorded golden requires an exact match: today's answer is no longer accepted
  assert.deepEqual(compareTranscripts(converted, converted, steps), { diffs: [], allowed: [] });
  assert.equal(compareTranscripts(converted, today, steps).diffs.length, 1);
  // A golden holding neither result for an allowed step is reported
  const odd: Transcript = { meta, steps: [today.steps[0], { ...today.steps[1], status: 400 }] };
  assert.equal(compareTranscripts(odd, odd, steps).diffs.length, 1);
  // Non-allowed steps compare exactly; missing and extra steps are reported
  assert.equal(compareTranscripts(today, { meta, steps: [{ ...today.steps[0], body: [2] }, today.steps[1]] }, steps).diffs.length, 1);
  assert.equal(compareTranscripts(today, { meta, steps: [today.steps[0]] }, steps).diffs.length, 1);
  assert.equal(compareTranscripts({ meta, steps: [today.steps[0]] }, today, steps).diffs.length, 1);
});

test("scenario: 45–80 unique steps; allowed differences only on malformed path ids and broken JSON", () => {
  const steps = buildScenario();
  assert.equal(new Set(steps.map((s) => s.id)).size, steps.length);
  assert.ok(steps.length >= 45 && steps.length <= 80, `${steps.length} steps`);
  for (const s of steps.filter((s) => s.allow)) {
    assert.equal(s.expect, 500, s.id);
    if (s.allow!.rule === "D1a") assert.match(s.path, /\/abc(\/|$)/, s.id);
    else assert.equal(s.rawBody, "{", s.id);
  }
  assert.equal(steps.filter((s) => s.allow?.rule === "D1a").length, 8);
  assert.equal(steps.filter((s) => s.allow?.rule === "D1c").length, 3);
  assert.deepEqual(steps.filter((s) => s.ties).map((s) => s.id), ["U05"]);
  assert.match(UNKNOWN_ID, /^[0-9a-f]{24}$/);
  assert.deepEqual(buildScenario(), steps);
});

test("golden: one transcript step per scenario step, today's statuses", () => {
  const golden = JSON.parse(readFileSync(join(process.cwd(), "scripts/projects-parity/golden/transcript.json"), "utf8")) as Transcript;
  const steps = buildScenario();
  assert.deepEqual(golden.steps.map((s) => s.id), steps.map((s) => s.id));
  for (const [i, s] of steps.entries()) {
    const g = golden.steps[i];
    assert.equal(g.request, `${s.method} ${s.path}`, s.id);
    assert.ok(s.expect === null || g.status === s.expect || g.status === s.allow?.status, `${s.id}: golden ${g.status}`);
  }
});
