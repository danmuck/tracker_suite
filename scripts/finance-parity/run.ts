// HTTP driver for the Finance parity scenario.
//
//   TZ=America/New_York node --experimental-strip-types --no-warnings --import ./scripts/register-ts.mjs \
//     scripts/finance-parity/run.ts capture --base http://localhost:3032 --out <file>
//   … run.ts check --base http://localhost:3032 [--golden scripts/finance-parity/golden/transcript.json]
//
// The server must be on an empty parity database (see reset-db.mjs) and on a port in 3031–3036.

import { execFileSync } from "node:child_process";
import { readFileSync, writeFileSync } from "node:fs";
import { buildScenario, type Step } from "./scenario";
import { compareTranscripts, createNormalizer, dayOrderConflicts, substitute, type Transcript, type TranscriptStep } from "./normalize";

const DEFAULT_GOLDEN = "scripts/finance-parity/golden/transcript.json";

class Abort extends Error {}

function fail(message: string): never {
  throw new Abort(message);
}

function localDate(now: Date): string {
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`;
}

function utcDate(now: Date): string {
  return now.toISOString().slice(0, 10);
}

function parseArgs(argv: string[]) {
  const [command, ...rest] = argv;
  const flags: Record<string, string> = {};
  for (let i = 0; i < rest.length; i += 2) {
    const flag = rest[i];
    if (!flag?.startsWith("--") || rest[i + 1] === undefined) fail(`Bad arguments: ${rest.join(" ")}`);
    flags[flag.slice(2)] = rest[i + 1];
  }
  return { command, flags };
}

function checkBase(base: string | undefined): string {
  if (!base) fail("--base is required");
  const url = new URL(base);
  const port = Number(url.port);
  if (port === 3030) fail("Refusing port 3030: that is the owner's server on the live database");
  if (!(port >= 3031 && port <= 3036)) fail(`Refusing port ${url.port || "(default)"}: use a parity server on 3031–3036`);
  return url.origin;
}

async function request(base: string, method: string, path: string, init: { body?: string } = {}) {
  const res = await fetch(base + path, {
    method,
    headers: init.body !== undefined ? { "content-type": "application/json" } : undefined,
    body: init.body,
  });
  const text = await res.text();
  let body: unknown;
  try {
    body = text === "" ? null : JSON.parse(text);
  } catch {
    fail(`${method} ${path}: response is not JSON (status ${res.status}): ${text.slice(0, 300)}`);
  }
  return { status: res.status, body };
}

function pick(value: unknown, path: string): unknown {
  let current = value;
  for (const part of path.split(".")) {
    if (current === null || typeof current !== "object") return undefined;
    current = (current as Record<string, unknown>)[part];
  }
  return current;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/** The first two probes: an empty dataset, then (only then) the account list holding at most Cash. */
async function probeEmpty(base: string) {
  const tx = await request(base, "GET", "/api/transactions");
  const total = isRecord(tx.body) && isRecord(tx.body.pagination) ? tx.body.pagination.total : undefined;
  if (tx.status !== 200 || total !== 0) {
    fail(`Refusing to run: GET /api/transactions reported status ${tx.status}, total ${JSON.stringify(total)}; the parity database must be empty (run reset-db.mjs)`);
  }
  const accounts = await request(base, "GET", "/api/accounts?includeArchived=true");
  const list = accounts.body;
  const ok =
    accounts.status === 200 &&
    Array.isArray(list) &&
    list.length <= 1 &&
    list.every((a) => isRecord(a) && a.isCash === true);
  if (!ok) fail(`Refusing to run: GET /api/accounts?includeArchived=true returned ${accounts.status} ${JSON.stringify(list).slice(0, 300)}`);
}

/** N7, first two checks: a response whose order rests on a tie. */
function tieChecks(step: Step, path: string, body: unknown): string[] {
  const problems: string[] = [];
  if (step.method === "GET" && path.startsWith("/api/transactions") && isRecord(body) && Array.isArray(body.data)) {
    const sort = new URL(path, "http://x").searchParams.get("sort") || "date";
    const items = body.data as Record<string, unknown>[];
    for (let i = 1; i < items.length; i++) {
      if (JSON.stringify(items[i - 1][sort]) === JSON.stringify(items[i][sort])) {
        problems.push(`items ${i - 1} and ${i} tie on ${sort} = ${JSON.stringify(items[i][sort])} (${String(items[i - 1]._id)}, ${String(items[i]._id)})`);
      }
    }
  }
  const breakdown = isRecord(body) && isRecord(body.data) ? body.data.categoryBreakdown : undefined;
  if (path.startsWith("/api/summary") && Array.isArray(breakdown)) {
    for (let i = 1; i < breakdown.length; i++) {
      if (breakdown[i - 1].amount === breakdown[i].amount) {
        problems.push(`categoryBreakdown entries ${breakdown[i - 1].category} and ${breakdown[i].category} tie on amount ${breakdown[i].amount}`);
      }
    }
  }
  return problems;
}

type Day = { date: string; transactions: { sourceTransactionId?: string; isRecurring?: boolean; date?: string }[] };

function daysOf(path: string, body: unknown): Day[] {
  const data = isRecord(body) && isRecord(body.data) ? body.data : undefined;
  if (!data) return [];
  if (path.startsWith("/api/projections") && Array.isArray(data.timeline)) return data.timeline as Day[];
  if (path.startsWith("/api/summary") && Array.isArray(data.days)) return data.days as Day[];
  return [];
}

async function createdTransactions(base: string) {
  const res = await request(base, "GET", "/api/transactions?limit=1000&sort=createdAt&order=asc");
  if (res.status !== 200 || !isRecord(res.body) || !Array.isArray(res.body.data)) fail(`Order-check read failed: ${res.status}`);
  return (res.body.data as { _id: string; date: string }[]).map((t) => ({ _id: t._id, date: t.date }));
}

async function runScenario(base: string, mode: "capture" | "check"): Promise<{ transcript: Transcript; steps: Step[] }> {
  if (process.env.TZ !== "America/New_York") fail(`TZ must be America/New_York, got ${JSON.stringify(process.env.TZ)}`);
  const started = new Date();
  const today = localDate(started);
  const startUtc = utcDate(started);
  const steps = buildScenario(today);

  await probeEmpty(base);

  const saved: Record<string, string> = {};
  const normalize = createNormalizer(() => saved);
  const out: TranscriptStep[] = [];
  let finalBalances: Record<string, number> | undefined;

  for (const step of steps) {
    const path = substitute(step.path, saved);
    const payload = step.rawBody !== undefined ? step.rawBody : step.body !== undefined ? JSON.stringify(substitute(step.body, saved)) : undefined;
    const needsOrder = (path.startsWith("/api/projections") || path.startsWith("/api/summary"));
    const created = needsOrder ? await createdTransactions(base) : [];

    const res = await request(base, step.method, path, { body: payload });

    if (mode === "capture" && step.expect !== null && res.status !== step.expect) {
      fail(`${step.id} ${step.method} ${step.path}: expected ${step.expect}, got ${res.status}: ${JSON.stringify(res.body).slice(0, 1000)}`);
    }

    const ties = res.status === 200 ? tieChecks(step, path, res.body) : [];
    if (ties.length > 0) fail(`${step.id} ${step.method} ${step.path}: order rests on a tie:\n  ${ties.join("\n  ")}`);
    if (needsOrder && res.status === 200) {
      const conflicts = dayOrderConflicts(daysOf(path, res.body), created);
      if (conflicts.length > 0) fail(`${step.id} ${step.method} ${step.path}: same-day order is store-specific:\n  ${conflicts.join("\n  ")}`);
    }

    if (step.save) {
      const id = pick(res.body, step.save.from);
      if (typeof id !== "string") fail(`${step.id}: nothing to save as ${step.save.name} at ${step.save.from} (status ${res.status})`);
      saved[step.save.name] = id;
    }

    if (step.id === "Z09") {
      if (!Array.isArray(res.body)) fail("Z09: expected an account list");
      const balances: Record<string, number> = {};
      for (const a of res.body as { name: string; balance: number }[]) balances[a.name] = a.balance;
      finalBalances = Object.fromEntries(Object.keys(balances).sort().map((k) => [k, balances[k]]));
    }

    out.push({ id: step.id, request: `${step.method} ${step.path}`, status: res.status, body: normalize(res.body) });
  }

  const ended = new Date();
  if (localDate(ended) !== today || utcDate(ended) !== startUtc) {
    fail(`The date changed during the run (local ${today} → ${localDate(ended)}, UTC ${startUtc} → ${utcDate(ended)}); run again`);
  }
  if (!finalBalances) fail("No finalBalances: step Z09 did not run");

  const commit = execFileSync("git", ["rev-parse", "HEAD"], { encoding: "utf8" }).trim();
  return {
    steps,
    transcript: {
      meta: { capturedAt: started.toISOString(), localDate: today, timeZone: process.env.TZ, commit },
      steps: out,
      finalBalances,
    },
  };
}

async function main() {
  const { command, flags } = parseArgs(process.argv.slice(2));
  if (command === "capture") {
    const base = checkBase(flags.base);
    if (!flags.out) fail("--out is required");
    const { transcript } = await runScenario(base, "capture");
    writeFileSync(flags.out, JSON.stringify(transcript, null, 2) + "\n");
    console.log(`captured ${transcript.steps.length} steps on ${transcript.meta.localDate} into ${flags.out}`);
    return;
  }
  if (command === "check") {
    const base = checkBase(flags.base);
    const golden = JSON.parse(readFileSync(flags.golden ?? DEFAULT_GOLDEN, "utf8")) as Transcript;
    const today = localDate(new Date());
    if (today !== golden.meta.localDate) {
      fail(`Today (${today}) is not the golden's capture date (${golden.meta.localDate}); the golden must be re-captured from the unconverted code first`);
    }
    const { transcript, steps } = await runScenario(base, "check");
    const diffs = compareTranscripts(golden, transcript, steps);
    if (diffs.length > 0) {
      console.error(`${diffs.length} difference(s):\n${diffs.join("\n")}`);
      process.exitCode = 1;
      return;
    }
    console.log(`parity: ${transcript.steps.length} steps match the golden`);
    return;
  }
  fail(`Unknown command ${JSON.stringify(command)}; use capture or check`);
}

main().catch((error: unknown) => {
  console.error(error instanceof Abort ? `aborted: ${error.message}` : error);
  process.exitCode = 1;
});
