// Finance parity transcripts: normalization (rules N1–N6), id substitution, comparison, and the
// N7 order checks (ties in a response, same-day order). Pure: no network, no database, no clock.

import type { Step } from "./scenario";

export interface TranscriptStep {
  id: string;
  request: string;
  status: number;
  body: unknown;
}

export interface Transcript {
  /** `utcDate` is the UTC calendar date at capture (also the first 10 characters of `capturedAt`) */
  meta: { capturedAt: string; localDate: string; utcDate?: string; timeZone: string; commit: string };
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
 * Differences between two transcripts, empty when they match. Every step must have the same status
 * and body. The golden is recorded on the converted routes, so a step with `allow` must hold its
 * allowed status (and error) there; a golden that still holds `expect` predates the conversion.
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
    const allow = byId.get(g.id)?.allow;
    if (allow) {
      const error = isPlainObject(g.body) ? g.body.error : undefined;
      if (g.status !== allow.status || (allow.error !== undefined && error !== allow.error)) {
        const wanted = `${allow.status}${allow.error !== undefined ? ` ${JSON.stringify(allow.error)}` : ""}`;
        diffs.push(`${g.id} ${g.request}: golden holds ${g.status} ${JSON.stringify(error)}, ${allow.rule} requires ${wanted} (re-record the golden)`);
      }
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

/** A stored transaction as the N7 third check reads it (from a createdAt-ascending list). */
export interface CreatedTx {
  _id: string;
  createdAt?: string;
}

/** A day entry as the N7 third check reads it (projection timeline or summary days). */
type DayEntry = { sourceTransactionId?: string; type?: string; date?: string };

/**
 * Whether two entries may share a same-day rank (src/lib/finance/same-day-order.ts: income, debits,
 * payments). Same type always may. A credit and a transfer may too: a credit on a card or debt
 * account is a payment, ranked with transfers, and the response does not say which accounts are
 * debt accounts, so this check assumes they might be (it errs towards reporting).
 */
function mayShareRank(a: DayEntry, b: DayEntry): boolean {
  if (a.type === b.type) return true;
  const pair = [a.type, b.type].sort().join("/");
  return pair === "credit/transfer";
}

/**
 * N7, third check. The engine orders each occurrence day's entries by rank, then the source
 * transaction's `createdAt`, then its `_id`, whether one-time or recurring. `_id`s differ between
 * the stores (ObjectIds vs random ids), so a day's order is store-specific exactly when two entries
 * from different sources on the same occurrence day may share a rank and have equal `createdAt`
 * (two missing ones included). Those pairs are reported, one message per day. `created` is every
 * stored transaction (with its `createdAt`); entries whose source is not stored (what-if additions,
 * interest lines) have no stored order and are not compared.
 *
 * A weekly or monthly timeline entry concatenates its days in date order, so two entries whose own
 * `date` differs are ordered by that date and are not compared.
 */
export function dayOrderConflicts(days: { date: string; transactions: DayEntry[] }[], created: CreatedTx[]): string[] {
  const byId = new Map<string, CreatedTx>();
  for (const t of created) byId.set(t._id, t);

  const messages: string[] = [];
  for (const day of days) {
    const pairs: string[] = [];
    const txs = day.transactions;
    for (let i = 0; i < txs.length; i++) {
      for (let j = i + 1; j < txs.length; j++) {
        const a = txs[i], b = txs[j];
        if (!a.sourceTransactionId || !b.sourceTransactionId || a.sourceTransactionId === b.sourceTransactionId) continue;
        if (a.date !== undefined && b.date !== undefined && a.date !== b.date) continue; // different days of a bucket
        const ca = byId.get(a.sourceTransactionId), cb = byId.get(b.sourceTransactionId);
        if (!ca || !cb) continue;
        if (mayShareRank(a, b) && ca.createdAt === cb.createdAt) {
          pairs.push(`${a.sourceTransactionId} (${a.type}) / ${b.sourceTransactionId} (${b.type}) tie on createdAt ${JSON.stringify(ca.createdAt)}`);
        }
      }
    }
    if (pairs.length > 0) messages.push(`${day.date}: same-day order rests on _id: ${pairs.join("; ")}`);
  }
  return messages;
}

/** N7, first two checks: where a response's order rests on a tie (empty when it does not). */
export function tieChecks(step: Step, path: string, body: unknown): string[] {
  const problems: string[] = [];
  if (step.method === "GET" && path.startsWith("/api/transactions") && isPlainObject(body) && Array.isArray(body.data)) {
    const sort = new URL(path, "http://x").searchParams.get("sort") || "date";
    const items = body.data as Record<string, unknown>[];
    for (let i = 1; i < items.length; i++) {
      if (JSON.stringify(items[i - 1][sort]) === JSON.stringify(items[i][sort])) {
        problems.push(`items ${i - 1} and ${i} tie on ${sort} = ${JSON.stringify(items[i][sort])} (${String(items[i - 1]._id)}, ${String(items[i]._id)})`);
      }
    }
  }
  const breakdown = isPlainObject(body) && isPlainObject(body.data) ? body.data.categoryBreakdown : undefined;
  if (path.startsWith("/api/summary") && Array.isArray(breakdown)) {
    for (let i = 1; i < breakdown.length; i++) {
      if (breakdown[i - 1].amount === breakdown[i].amount) {
        problems.push(`categoryBreakdown entries ${breakdown[i - 1].category} and ${breakdown[i].category} tie on amount ${breakdown[i].amount}`);
      }
    }
  }
  return problems;
}

export type Day = { date: string; transactions: DayEntry[] };

export function daysOf(path: string, body: unknown): Day[] {
  const data = isPlainObject(body) && isPlainObject(body.data) ? body.data : undefined;
  if (!data) return [];
  if (path.startsWith("/api/projections") && Array.isArray(data.timeline)) return data.timeline as Day[];
  if (path.startsWith("/api/summary") && Array.isArray(data.days)) return data.days as Day[];
  return [];
}
