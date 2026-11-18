// In-process proof: the Figure parity scenario replayed through `dispatch` against the Figure
// handlers on a BrowserStore, from the golden's recorded clock, must reproduce the golden transcript
// (recorded over HTTP on MongoDB) step for step.
//
// The golden is recorded from the converted routes, so every step, the allowed differences
// included, must match exactly. A difference means a handler, the store or this harness is wrong,
// or the golden was not re-recorded after an intended change.

import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { BrowserStore } from "@/lib/data/browser-store";
import { dispatch } from "@/lib/data/dispatch";
import { memoryStorage } from "@/lib/data/test-helpers";
import { buildScenario, rememberId, UNKNOWN_ID } from "../../../../scripts/figure-parity/scenario";
import {
  compareTranscripts,
  createNormalizer,
  orderCheck,
  substitute,
  type Transcript,
  type TranscriptStep,
} from "../../../../scripts/figure-parity/normalize";
import { figureRoutes } from "./routes";

const GOLDEN = "scripts/figure-parity/golden/transcript.json";

function pick(value: unknown, path: string): unknown {
  let current = value;
  for (const part of path.split(".")) {
    if (current === null || typeof current !== "object") return undefined;
    current = (current as Record<string, unknown>)[part];
  }
  return current;
}

/** What an HTTP client would parse: undefined properties vanish. */
function overHttp(body: unknown): unknown {
  const json = JSON.stringify(body);
  return json === undefined ? null : JSON.parse(json);
}

test("the handlers reproduce the golden transcript on a browser store", async (t) => {
  const golden = JSON.parse(readFileSync(join(process.cwd(), GOLDEN), "utf8")) as Transcript;
  const steps = buildScenario();

  // Store timestamps advance 1 ms per write call from the capture instant: no two documents share a
  // createdAt (logs, runs and workouts sort on it) and updatedAt moves on every write, as on MongoDB.
  const now = new Date(golden.meta.capturedAt);
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
  rememberId(saved, "unknown", UNKNOWN_ID);
  const normalize = createNormalizer(() => saved);
  const out: TranscriptStep[] = [];
  const orderProblems: string[] = [];

  for (const step of steps) {
    current = step.id;
    const path = substitute(step.path, saved);
    // A malformed JSON body (`rawBody`) reaches the handler as no body, as serve()'s readBody gives it
    const body = step.rawBody !== undefined ? undefined : step.body !== undefined ? substitute(step.body, saved) : undefined;
    const result = await dispatch(figureRoutes, store, step.method, path, body, now);
    let resBody = overHttp(result.body);

    if (result.status === 200) {
      const checked = orderCheck(step, path, resBody);
      for (const p of checked.problems) orderProblems.push(`${step.id}: ${p}`);
      resBody = checked.body;
    }

    if (step.save) {
      const id = pick(resBody, step.save.from);
      if (typeof id !== "string") {
        assert.fail(`${step.id}: nothing to save as ${step.save.name} at ${step.save.from} (status ${result.status}): ${JSON.stringify(resBody).slice(0, 500)}`);
      }
      rememberId(saved, step.save.name, id);
    }

    out.push({ id: step.id, request: `${step.method} ${step.path}`, status: result.status, body: normalize(resBody) });
  }

  assert.deepEqual(orderProblems, [], orderProblems.join("\n"));

  const actual: Transcript = { meta: golden.meta, steps: out };
  const { diffs, allowed } = compareTranscripts(golden, actual, steps);
  const details = diffs.map((d) => {
    const id = d.split(/[ :]/)[0];
    const logs = (logged.get(id) ?? []).map((m) => `\n    console.error: ${m.slice(0, 300)}`).join("");
    return `${d.length > 800 ? `${d.slice(0, 800)}…` : d}${logs}`;
  });
  assert.deepEqual(diffs, [], `${diffs.length} difference(s) from the golden transcript:\n${details.join("\n")}`);
  // The golden holds the converted code's answers: no step may pass only as an allowed difference
  assert.deepEqual(allowed, [], "the golden still holds the unconverted routes' answers; re-record it from the converted code");
});
