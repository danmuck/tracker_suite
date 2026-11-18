// Projects parity transcripts: normalization, the list-order checks, and comparison.
// Pure: no network, no database, no clock. `substitute` is the Finance tooling's, unchanged.
//
// Normalization differs from Finance's on purpose: only `createdAt` (dropped) and `updatedAt` (marked
// <new> / <same> / <changed> per document) are "now" instants here. Every other date, `dueDate` with a
// time of day included, is client data and is recorded verbatim.

import type { Step } from "./scenario";

export { substitute } from "../finance-parity/normalize";

export interface TranscriptStep {
  id: string;
  request: string;
  status: number;
  body: unknown;
}

export interface Transcript {
  meta: { capturedAt: string; commit: string };
  steps: TranscriptStep[];
}

const HEX_ID = /^[0-9a-f]{24}$/;

type Json = null | boolean | number | string | Json[] | { [key: string]: Json };

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/**
 * A normalizer for one run; apply it to each response body in order (aliases and updatedAt markers
 * carry over). Ids become `<name>` when saved under a name, else `<id:N>` by first appearance; keys
 * are sorted; `createdAt` and `__v` are dropped; `updatedAt` becomes <new> the first time a document
 * is seen, then <same> or <changed> against the value last seen for it.
 */
export function createNormalizer(saved: () => Record<string, string>): (body: unknown) => unknown {
  const numbered = new Map<string, string>();
  const lastSeen = new Map<string, string>();

  function alias(id: string): string {
    for (const [name, value] of Object.entries(saved())) {
      if (value === id) return `<${name}>`;
    }
    let found = numbered.get(id);
    if (!found) {
      found = `<id:${numbered.size + 1}>`;
      numbered.set(id, found);
    }
    return found;
  }

  function visit(value: Json): Json {
    if (Array.isArray(value)) return value.map(visit);
    if (isPlainObject(value)) {
      const obj = value as Record<string, Json>;
      const out: Record<string, Json> = {};
      for (const key of Object.keys(obj).sort()) {
        if (key === "createdAt" || key === "__v") continue;
        if (key === "updatedAt") {
          if (typeof obj._id !== "string") continue;
          const current = JSON.stringify(obj[key]);
          const previous = lastSeen.get(obj._id);
          lastSeen.set(obj._id, current);
          out[key] = previous === undefined ? "<new>" : previous === current ? "<same>" : "<changed>";
          continue;
        }
        out[key] = visit(obj[key]);
      }
      return out;
    }
    if (typeof value === "string" && HEX_ID.test(value)) return alias(value);
    return value;
  }

  return (body: unknown) => (body === undefined ? undefined : visit(JSON.parse(JSON.stringify(body)) as Json));
}

type TaskRow = { _id?: unknown; status?: unknown; order?: unknown; title?: unknown };
type ProjectRow = { _id?: unknown; createdAt?: unknown };

function cmp(a: unknown, b: unknown): number {
  if (typeof a === "number" && typeof b === "number") return a - b;
  const x = String(a), y = String(b);
  return x < y ? -1 : x > y ? 1 : 0;
}

/**
 * The order rules for list responses (raw bodies, before normalization). Returns the body to record
 * and the problems found (empty when the order is safe to compare).
 *
 * - `GET /api/tasks`: MongoDB sorts `{ status: 1, order: 1 }` with no tie-breaker. The list must be in
 *   that order. Adjacent items tied on (status, order) are a problem unless the step is marked `ties`;
 *   a `ties` step must hold at least one tie, and its tied runs are re-ordered by title so the
 *   recorded order does not depend on the store.
 * - `GET /api/projects`: sorted by `createdAt` descending. Two equal `createdAt` values are a problem.
 */
export function orderCheck(step: Step, path: string, body: unknown): { body: unknown; problems: string[] } {
  const problems: string[] = [];
  if (step.method !== "GET" || !Array.isArray(body)) return { body, problems };
  const route = path.split("?")[0];

  if (route === "/api/tasks") {
    const rows = body as TaskRow[];
    let ties = 0;
    for (let i = 1; i < rows.length; i++) {
      const a = rows[i - 1], b = rows[i];
      const c = cmp(a.status, b.status) || cmp(a.order, b.order);
      if (c > 0) problems.push(`items ${i - 1} and ${i} are not in (status, order) order: ${String(a.status)}/${String(a.order)} before ${String(b.status)}/${String(b.order)}`);
      if (c === 0) {
        ties++;
        if (!step.ties) problems.push(`items ${i - 1} and ${i} tie on (status, order) = (${String(b.status)}, ${String(b.order)}) (${String(a._id)}, ${String(b._id)})`);
      }
    }
    if (step.ties && ties === 0) problems.push("the step is marked `ties` but the list holds no tie in (status, order)");
    if (step.ties && problems.length === 0) {
      const sorted = [...rows].sort((a, b) => cmp(a.status, b.status) || cmp(a.order, b.order) || cmp(a.title, b.title));
      return { body: sorted, problems };
    }
  }

  if (route === "/api/projects") {
    const rows = body as ProjectRow[];
    for (let i = 1; i < rows.length; i++) {
      const c = cmp(rows[i - 1].createdAt, rows[i].createdAt);
      if (c === 0) problems.push(`projects ${i - 1} and ${i} tie on createdAt ${JSON.stringify(rows[i].createdAt)}`);
      if (c < 0) problems.push(`projects ${i - 1} and ${i} are not in createdAt-descending order`);
    }
  }

  return { body, problems };
}

/**
 * Differences between a golden and an actual transcript (empty when they match), and the steps
 * accepted as allowed differences. A step matches when status and normalized body are equal. A
 * step with `allow` whose golden still holds today's result (`expect`) also matches when the actual
 * run answers exactly `allow.status` (and `allow.error`, if set) instead: that is the converted code's
 * intended answer. Once the golden is re-recorded on converted code it holds the allowed result and
 * every step must match exactly. A golden holding anything else for an `allow` step is reported.
 */
export function compareTranscripts(golden: Transcript, actual: Transcript, steps: Step[]): { diffs: string[]; allowed: string[] } {
  const diffs: string[] = [];
  const allowed: string[] = [];
  const byId = new Map(steps.map((s) => [s.id, s]));
  const actualById = new Map(actual.steps.map((s) => [s.id, s]));
  const goldenIds = new Set(golden.steps.map((s) => s.id));

  const errorOf = (body: unknown) => (isPlainObject(body) ? body.error : undefined);

  for (const g of golden.steps) {
    const a = actualById.get(g.id);
    if (!a) {
      diffs.push(`${g.id}: missing from the actual transcript`);
      continue;
    }
    if (a.request !== g.request) diffs.push(`${g.id}: request ${JSON.stringify(a.request)}, golden ${JSON.stringify(g.request)}`);
    const step = byId.get(g.id);
    const allow = step?.allow;
    const matchesAllow = (s: TranscriptStep) => !!allow && s.status === allow.status && (allow.error === undefined || errorOf(s.body) === allow.error);

    if (allow && !(g.status === step.expect || matchesAllow(g))) {
      diffs.push(`${g.id} ${g.request}: golden holds ${g.status}, the step allows only ${step.expect} (today) or ${allow.status} (${allow.rule})`);
      continue;
    }
    const left = JSON.stringify({ status: g.status, body: g.body });
    const right = JSON.stringify({ status: a.status, body: a.body });
    if (left === right) continue;
    if (allow && g.status === step.expect && matchesAllow(a)) {
      allowed.push(`${g.id} ${g.request}: ${g.status} → ${a.status} ${JSON.stringify(errorOf(a.body))} (${allow.rule})`);
      continue;
    }
    diffs.push(`${g.id} ${g.request}: golden ${left}\n  actual ${right}`);
  }
  for (const a of actual.steps) {
    if (!goldenIds.has(a.id)) diffs.push(`${a.id}: not in the golden transcript`);
  }
  return { diffs, allowed };
}
