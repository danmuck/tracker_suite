// Figure parity transcripts. Normalization and comparison are the Projects tooling's, unchanged:
// ids become aliases by first appearance (or `<name>` when saved), `createdAt` / `updatedAt` become
// <new> / <same> / <changed>, `__v` is dropped, keys are sorted. Every other date (`date` fields are
// `yyyy-MM-dd` strings) is client data and is recorded verbatim. Only the list-order rules are Figure's.
// Pure: no network, no database, no clock.

import type { Step } from "./scenario";

export { substitute, createNormalizer, compareTranscripts, type Transcript, type TranscriptStep } from "../projects-parity/normalize";

type Row = Record<string, unknown>;

function cmp(a: unknown, b: unknown): number {
  if (typeof a === "number" && typeof b === "number") return a - b;
  const x = String(a), y = String(b);
  return x < y ? -1 : x > y ? 1 : 0;
}

/** Sort keys per list route; `-1` is descending. Each route's last key settles every tie today. */
const LIST_ORDER: Record<string, [string, 1 | -1][]> = {
  "/api/figure/workouts": [["order", 1], ["createdAt", 1]],
  "/api/figure/workout-logs": [["date", -1], ["createdAt", -1]],
  "/api/figure/runs": [["date", -1], ["createdAt", -1]],
  // MongoDB compares strings by byte; for ASCII names that is JavaScript's `<`
  "/api/figure/recipes": [["name", 1]],
  "/api/figure/shopping-items": [["checked", 1], ["order", 1]],
};

/**
 * The order rules for list responses (raw bodies, before normalization). Returns the body to record
 * and the problems found (empty when the order is safe to compare): each list must be in its route's
 * sort order, and two adjacent rows equal on every sort key are a problem, since MongoDB orders them
 * arbitrarily.
 */
export function orderCheck(step: Step, path: string, body: unknown): { body: unknown; problems: string[] } {
  const problems: string[] = [];
  if (step.method !== "GET" || !Array.isArray(body)) return { body, problems };
  const keys = LIST_ORDER[path.split("?")[0]];
  if (!keys) return { body, problems };

  const rows = body as Row[];
  const show = (r: Row) => keys.map(([k]) => JSON.stringify(r[k])).join("/");
  for (let i = 1; i < rows.length; i++) {
    let c = 0;
    for (const [key, dir] of keys) {
      c = cmp(rows[i - 1][key], rows[i][key]) * dir;
      if (c !== 0) break;
    }
    if (c > 0) problems.push(`rows ${i - 1} and ${i} are out of order: ${show(rows[i - 1])} before ${show(rows[i])}`);
    if (c === 0) problems.push(`rows ${i - 1} and ${i} tie on ${keys.map(([k]) => k).join(", ")} = ${show(rows[i])}`);
  }
  return { body, problems };
}
