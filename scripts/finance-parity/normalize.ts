// Finance parity transcripts: normalization (rules N1–N6), id substitution, comparison, and the
// day-order check (N7, third check). Pure: no network, no database, no clock.

import type { Step } from "./scenario";

export interface TranscriptStep {
  id: string;
  request: string;
  status: number;
  body: unknown;
}

export interface Transcript {
  meta: { capturedAt: string; localDate: string; timeZone: string; commit: string };
  steps: TranscriptStep[];
  finalBalances: Record<string, number>;
}

const HEX_ID = /^[0-9a-f]{24}$/;
const INSTANT = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/;
const MIDNIGHT = "T00:00:00.000Z";

type Json = null | boolean | number | string | Json[] | { [key: string]: Json };

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function sortKeys(obj: Record<string, Json>): Record<string, Json> {
  const out: Record<string, Json> = {};
  for (const key of Object.keys(obj).sort()) out[key] = obj[key];
  return out;
}

/**
 * A normalizer for one run. Apply it to each response body in order: id aliases and the
 * updatedAt markers carry over from one response to the next.
 */
export function createNormalizer(saved: () => Record<string, string>): (body: unknown) => unknown {
  const numbered = new Map<string, string>(); // raw id → <id:N>
  const lastSeen = new Map<string, string>(); // slot → last timestamp value

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

  function mark(slot: string, value: string): string {
    const previous = lastSeen.get(slot);
    lastSeen.set(slot, value);
    if (previous === undefined) return "<new>";
    return previous === value ? "<same>" : "<changed>";
  }

  // N6: count|latestTxMs|profileMs|id:balance:ms,…
  function normalizeDataVersion(value: string): string {
    const parts = value.split("|");
    if (parts.length !== 4) return value;
    const [count, latestTx, profile, accounts] = parts;
    const latest = mark("dataVersion:latestTx", latestTx);
    const prof = mark("dataVersion:profile", profile);
    const entries = accounts === ""
      ? []
      : accounts.split(",").map((entry) => {
          const [id, balance, ms] = entry.split(":");
          return `${HEX_ID.test(id) ? alias(id) : id}:${balance}:${mark(`dataVersion:account:${id}`, ms)}`;
        });
    entries.sort();
    return `${count}|${latest}|${prof}|${entries.join(",")}`;
  }

  function visit(value: Json): Json {
    if (Array.isArray(value)) return value.map(visit);
    if (isPlainObject(value)) {
      const obj = value as Record<string, Json>;
      const out: Record<string, Json> = {};
      // N2: walk keys in sorted order, so first appearances (N3) are numbered deterministically
      for (const key of Object.keys(obj).sort()) {
        if (key === "createdAt" || key === "__v") continue; // N1
        const child = obj[key];
        let result: Json;
        if (key === "updatedAt") {
          // N5
          if (!("_id" in obj) || typeof obj._id !== "string") continue;
          result = mark(`doc:${obj._id}`, JSON.stringify(child));
        } else if (key === "dataVersion" && typeof child === "string") {
          result = normalizeDataVersion(child);
        } else {
          result = visit(child);
        }
        out[HEX_ID.test(key) ? alias(key) : key] = result; // N3 on keys
      }
      return sortKeys(out);
    }
    if (typeof value === "string") {
      if (HEX_ID.test(value)) return alias(value); // N3
      if (INSTANT.test(value) && !value.endsWith(MIDNIGHT)) return "<instant>"; // N4
    }
    return value;
  }

  return (body: unknown) => (body === undefined ? undefined : visit(JSON.parse(JSON.stringify(body)) as Json));
}

/** Replace `{name}` in every string and every object key with the id saved under that name. */
export function substitute<T>(value: T, saved: Record<string, string>): T {
  const fill = (s: string) =>
    s.replace(/\{(\w+)\}/g, (_, name: string) => {
      const id = saved[name];
      if (id === undefined) throw new Error(`No id saved under "${name}" (in "${s}")`);
      return id;
    });
  const walk = (v: unknown): unknown => {
    if (typeof v === "string") return fill(v);
    if (Array.isArray(v)) return v.map(walk);
    if (isPlainObject(v)) {
      const out: Record<string, unknown> = {};
      for (const [k, child] of Object.entries(v)) out[fill(k)] = walk(child);
      return out;
    }
    return v;
  };
  return walk(value) as T;
}

/** Key-order-independent JSON for comparisons. */
function stable(value: unknown): string {
  const walk = (v: unknown): unknown => {
    if (Array.isArray(v)) return v.map(walk);
    if (isPlainObject(v)) {
      const out: Record<string, unknown> = {};
      for (const k of Object.keys(v).sort()) out[k] = walk(v[k]);
      return out;
    }
    return v;
  };
  return JSON.stringify(walk(value)) ?? "undefined";
}

/**
 * Differences between two transcripts, empty when they match. A step with `allow` is checked
 * against its expected status in the golden and its allowed status (and error) in the actual run;
 * every other step must have the same status and body.
 */
export function compareTranscripts(golden: Transcript, actual: Transcript, steps: Step[]): string[] {
  const diffs: string[] = [];
  const byId = new Map(steps.map((s) => [s.id, s]));
  const actualById = new Map(actual.steps.map((s) => [s.id, s]));
  const goldenIds = new Set(golden.steps.map((s) => s.id));

  for (const g of golden.steps) {
    const a = actualById.get(g.id);
    if (!a) {
      diffs.push(`${g.id}: missing from the actual transcript`);
      continue;
    }
    if (a.request !== g.request) diffs.push(`${g.id}: request ${JSON.stringify(a.request)}, golden ${JSON.stringify(g.request)}`);
    const step = byId.get(g.id);
    if (step?.allow) {
      if (g.status !== step.expect) diffs.push(`${g.id}: golden status ${g.status}, scenario expects ${step.expect}`);
      const error = isPlainObject(a.body) ? a.body.error : undefined;
      const errorOk = step.allow.error === undefined || error === step.allow.error;
      if (a.status !== step.allow.status || !errorOk) {
        const wanted = `${step.allow.status}${step.allow.error !== undefined ? ` ${JSON.stringify(step.allow.error)}` : ""}`;
        diffs.push(`${g.id} ${g.request}: got ${a.status} ${JSON.stringify(error)}, ${step.allow.rule} allows ${wanted}`);
      }
      continue;
    }
    const left = JSON.stringify({ status: g.status, body: g.body });
    const right = JSON.stringify({ status: a.status, body: a.body });
    if (left !== right) diffs.push(`${g.id} ${g.request}: golden ${left}\n  actual ${right}`);
  }
  for (const a of actual.steps) {
    if (!goldenIds.has(a.id)) diffs.push(`${a.id}: not in the golden transcript`);
  }
  if (stable(golden.finalBalances) !== stable(actual.finalBalances)) {
    diffs.push(`finalBalances: golden ${stable(golden.finalBalances)}, actual ${stable(actual.finalBalances)}`);
  }
  return diffs;
}

/**
 * N7, third check. For each day, two entries of the same kind (both recurring or both one-time)
 * with different source ids are reported when their creation order and their stored-date-descending
 * order disagree: the engine keeps input order within a day, and the stores return input in
 * different orders. `created` is every stored transaction in creation order. One message per day.
 *
 * A weekly or monthly timeline entry concatenates its days in date order, so two entries whose own
 * `date` differs are ordered by that date, not by input order, and are not compared.
 */
export function dayOrderConflicts(
  days: { date: string; transactions: { sourceTransactionId?: string; isRecurring?: boolean; date?: string }[] }[],
  created: { _id: string; date: string }[],
): string[] {
  const position = new Map<string, number>();
  const dateOf = new Map<string, string>();
  created.forEach((t, i) => {
    position.set(t._id, i);
    dateOf.set(t._id, t.date);
  });

  const messages: string[] = [];
  for (const day of days) {
    const pairs: string[] = [];
    const txs = day.transactions;
    for (let i = 0; i < txs.length; i++) {
      for (let j = i + 1; j < txs.length; j++) {
        const a = txs[i], b = txs[j];
        if (!a.sourceTransactionId || !b.sourceTransactionId || a.sourceTransactionId === b.sourceTransactionId) continue;
        if (!!a.isRecurring !== !!b.isRecurring) continue;
        if (a.date !== undefined && b.date !== undefined && a.date !== b.date) continue; // different days of a bucket
        const pa = position.get(a.sourceTransactionId), pb = position.get(b.sourceTransactionId);
        if (pa === undefined || pb === undefined) continue;
        const da = dateOf.get(a.sourceTransactionId)!, db = dateOf.get(b.sourceTransactionId)!;
        if (da === db) continue; // stored-date order does not decide between them
        const creationFirstIsA = pa < pb;
        const dateDescFirstIsA = da > db;
        if (creationFirstIsA !== dateDescFirstIsA) {
          pairs.push(`${a.sourceTransactionId} (created #${pa + 1}, ${da}) / ${b.sourceTransactionId} (created #${pb + 1}, ${db})`);
        }
      }
    }
    if (pairs.length > 0) messages.push(`${day.date}: creation order and stored-date-descending order disagree: ${pairs.join("; ")}`);
  }
  return messages;
}
