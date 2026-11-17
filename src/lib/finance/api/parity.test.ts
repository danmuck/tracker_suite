// D10, in-process proof: the parity scenario replayed through `dispatch` against the Finance
// handlers on a BrowserStore, at the golden's recorded clock, must reproduce the golden transcript
// (recorded over HTTP on MongoDB from the converted routes) exactly, step for step.
//
// A difference here means a handler, the store or this harness is wrong, or the golden was not
// re-recorded after an intended change.

import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { BrowserStore } from "@/lib/data/browser-store";
import { dispatch } from "@/lib/data/dispatch";
import { memoryStorage } from "@/lib/data/test-helpers";
import { localDateStr } from "@/lib/finance/dates";
import { buildScenario } from "../../../../scripts/finance-parity/scenario";
import {
  compareTranscripts,
  createNormalizer,
  dayOrderConflicts,
  daysOf,
  substitute,
  tieChecks,
  type Transcript,
  type TranscriptStep,
} from "../../../../scripts/finance-parity/normalize";
import { transactions } from "./docs";
import { financeRoutes } from "./routes";

const GOLDEN = "scripts/finance-parity/golden/transcript.json";

function pick(value: unknown, path: string): unknown {
  let current = value;
  for (const part of path.split(".")) {
    if (current === null || typeof current !== "object") return undefined;
    current = (current as Record<string, unknown>)[part];
  }
  return current;
}

/** What an HTTP client would parse: undefined properties vanish, NaN and Infinity become null. */
function overHttp(body: unknown): unknown {
  const json = JSON.stringify(body);
  return json === undefined ? null : JSON.parse(json);
}

/** Up to `max` paths where two normalized bodies differ, each with the expected and actual value. */
function bodyDifferences(expected: unknown, actual: unknown, max = 8): string[] {
  const out: string[] = [];
  const show = (v: unknown) => (v === undefined ? "(missing)" : JSON.stringify(v).slice(0, 200));
  const walk = (e: unknown, a: unknown, path: string) => {
    if (out.length >= max) return;
    const eObj = typeof e === "object" && e !== null;
    const aObj = typeof a === "object" && a !== null;
    if (eObj && aObj && Array.isArray(e) === Array.isArray(a)) {
      if (Array.isArray(e) && Array.isArray(a) && e.length !== a.length) {
        out.push(`${path || "(body)"}: length ${e.length} expected, ${a.length} actual`);
      }
      const keys = new Set([...Object.keys(e), ...Object.keys(a)]);
      for (const key of keys) {
        walk((e as Record<string, unknown>)[key], (a as Record<string, unknown>)[key], path === "" ? key : `${path}.${key}`);
      }
      return;
    }
    if (JSON.stringify(e) !== JSON.stringify(a)) out.push(`${path || "(body)"}: expected ${show(e)}, actual ${show(a)}`);
  };
  walk(expected, actual, "");
  return out;
}

/** A readable report: per differing step its status and the first differing paths, then compareTranscripts' own lines. */
function report(golden: Transcript, actual: Transcript, diffs: string[], logged: Map<string, string[]>): string {
  const actualById = new Map(actual.steps.map((s) => [s.id, s]));
  const lines = [`${diffs.length} difference(s) from the golden transcript:`];
  for (const g of golden.steps) {
    const a = actualById.get(g.id);
    if (!a) continue;
    if (JSON.stringify({ s: g.status, b: g.body }) === JSON.stringify({ s: a.status, b: a.body })) continue;
    lines.push(`- ${g.id} ${g.request}: status expected ${g.status}, actual ${a.status}`);
    for (const d of bodyDifferences(g.body, a.body)) lines.push(`    ${d}`);
    for (const message of logged.get(g.id) ?? []) lines.push(`    console.error: ${message.slice(0, 300)}`);
  }
  lines.push("compareTranscripts:");
  for (const d of diffs) lines.push(`  ${d.length > 600 ? `${d.slice(0, 600)}…` : d}`);
  return lines.join("\n");
}

test("the handlers reproduce the golden transcript on a browser store", async (t) => {
  const golden = JSON.parse(readFileSync(join(process.cwd(), GOLDEN), "utf8")) as Transcript;

  // Dates in the transcript are local-calendar results: a different TZ fails here, not in 191 steps
  assert.equal(
    process.env.TZ,
    golden.meta.timeZone,
    `TZ must be ${golden.meta.timeZone} (the golden's capture timezone), got ${JSON.stringify(process.env.TZ)}; run with npm test`,
  );
  const now = new Date(golden.meta.capturedAt);
  assert.equal(localDateStr(now), golden.meta.localDate, "the capture instant must fall on the golden's local date");
  const steps = buildScenario(golden.meta.localDate);

  // Store timestamps advance 1 ms per write call from the capture instant: writes from different
  // requests never share a createdAt / updatedAt (the stores sort and compare on them), and the
  // run is deterministic. Handlers still see `now` (the capture instant) as today.
  let tick = now.getTime();
  const store = new BrowserStore(memoryStorage(), () => new Date(tick++));

  // The 500 steps log their errors; keep them per step for the failure report instead of the console
  const logged = new Map<string, string[]>();
  let current = "";
  t.mock.method(console, "error", (...args: unknown[]) => {
    const list = logged.get(current) ?? [];
    list.push(args.map((a) => (a instanceof Error ? `${a.name}: ${a.message}` : String(a))).join(" "));
    logged.set(current, list);
  });

  const saved: Record<string, string> = {};
  const normalize = createNormalizer(() => saved);
  const out: TranscriptStep[] = [];
  const orderProblems: string[] = [];
  let finalBalances: Record<string, number> | undefined;

  for (const step of steps) {
    current = step.id;
    const path = substitute(step.path, saved);
    // A malformed JSON body (`rawBody`) reaches the handler as no body, as serve()'s readBody gives it
    const body = step.rawBody !== undefined ? undefined : step.body !== undefined ? substitute(step.body, saved) : undefined;
    const needsOrder = path.startsWith("/api/projections") || path.startsWith("/api/summary");
    const created = needsOrder
      ? (await transactions(store).find({}, { sort: { createdAt: 1 } })).map((d) => ({ _id: d._id, date: d.date, type: d.type, createdAt: d.createdAt }))
      : [];

    const result = await dispatch(financeRoutes, store, step.method, path, body, now);
    const resBody = overHttp(result.body);

    // N7: the golden's order must never rest on a tie or on store-specific same-day order
    if (result.status === 200) {
      for (const p of tieChecks(step, path, resBody)) orderProblems.push(`${step.id}: order rests on a tie: ${p}`);
      if (needsOrder) {
        for (const p of dayOrderConflicts(daysOf(path, resBody), created)) orderProblems.push(`${step.id}: ${p}`);
      }
    }

    if (step.save) {
      const id = pick(resBody, step.save.from);
      if (typeof id !== "string") {
        assert.fail(`${step.id}: nothing to save as ${step.save.name} at ${step.save.from} (status ${result.status}): ${JSON.stringify(resBody).slice(0, 500)}`);
      }
      saved[step.save.name] = id;
    }

    if (step.id === "Z09") {
      assert.ok(Array.isArray(resBody), `Z09: expected an account list, got ${result.status} ${JSON.stringify(resBody).slice(0, 300)}`);
      const balances: Record<string, number> = {};
      for (const a of resBody as { name: string; balance: number }[]) balances[a.name] = a.balance;
      finalBalances = Object.fromEntries(Object.keys(balances).sort().map((k) => [k, balances[k]]));
    }

    out.push({ id: step.id, request: `${step.method} ${step.path}`, status: result.status, body: normalize(resBody) });
  }

  assert.deepEqual(orderProblems, [], orderProblems.join("\n"));
  assert.ok(finalBalances, "No finalBalances: step Z09 did not run");

  const actual: Transcript = { meta: golden.meta, steps: out, finalBalances };
  const diffs = compareTranscripts(golden, actual, steps);
  assert.deepEqual(diffs, [], report(golden, actual, diffs, logged));
});
