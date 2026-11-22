// HTTP driver for the Projects parity scenario.
//
//   node scripts/projects-parity/reset-db.mjs
//   MONGODB_URI=mongodb://localhost:27017/tracker_parity NEXT_DIST_DIR=.next-parity npx next dev -p 3032
//   node --experimental-strip-types --no-warnings --import ./scripts/register-ts.mjs \
//     scripts/projects-parity/run.ts capture --base http://localhost:3032 --out <file>
//   … run.ts check --base http://localhost:3032 [--golden scripts/projects-parity/golden/transcript.json]
//
// The server must be on an empty parity database (reset-db.mjs) and on a port in 3031–3036; the
// runner refuses port 3030, any other port and any host but localhost / 127.0.0.1. The Projects
// routes read no clock beyond timestamps, so no TZ is required.
//
// `capture` records a transcript; each step must answer its `expect` (or, on converted code, its
// `allow.status`). `check` replays on a fresh database and compares with the golden: an exact match,
// except that a step with `allow` may answer exactly its allowed result while the golden still holds
// today's (see normalize.ts, compareTranscripts). Allowed differences are listed.

import { execFileSync } from "node:child_process";
import { readFileSync, writeFileSync } from "node:fs";
import { buildScenario, UNKNOWN_ID, type Step } from "./scenario";
import { compareTranscripts, createNormalizer, orderCheck, substitute, type Transcript, type TranscriptStep } from "./normalize";

const DEFAULT_GOLDEN = "scripts/projects-parity/golden/transcript.json";

class Abort extends Error {}

function fail(message: string): never {
  throw new Abort(message);
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

// Same guard as scripts/finance-parity/run.ts
function checkBase(base: string | undefined): string {
  if (!base) fail("--base is required");
  const url = new URL(base);
  if (url.protocol !== "http:" || (url.hostname !== "localhost" && url.hostname !== "127.0.0.1")) {
    fail(`Refusing ${url.origin}: the parity server must be http on localhost or 127.0.0.1`);
  }
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

/** Refuses to run unless the database holds no project and no task under the unknown id. */
async function probeEmpty(base: string) {
  const projects = await request(base, "GET", "/api/projects");
  if (projects.status !== 200 || !Array.isArray(projects.body) || projects.body.length !== 0) {
    fail(`Refusing to run: GET /api/projects returned ${projects.status} ${JSON.stringify(projects.body).slice(0, 300)}; the parity database must be empty (run reset-db.mjs)`);
  }
  const orphans = await request(base, "GET", `/api/tasks?projectId=${UNKNOWN_ID}`);
  if (orphans.status !== 200 || !Array.isArray(orphans.body) || orphans.body.length !== 0) {
    fail(`Refusing to run: GET /api/tasks?projectId=${UNKNOWN_ID} returned ${orphans.status} ${JSON.stringify(orphans.body).slice(0, 300)}; run reset-db.mjs`);
  }
}

async function runScenario(base: string): Promise<{ transcript: Transcript; steps: Step[] }> {
  const started = new Date();
  const steps = buildScenario();
  await probeEmpty(base);

  const saved: Record<string, string> = { unknown: UNKNOWN_ID };
  const normalize = createNormalizer(() => saved);
  const out: TranscriptStep[] = [];

  for (const step of steps) {
    const path = substitute(step.path, saved);
    const payload = step.rawBody !== undefined ? step.rawBody : step.body !== undefined ? JSON.stringify(substitute(step.body, saved)) : undefined;
    const res = await request(base, step.method, path, { body: payload });

    const accepted = step.expect === null || res.status === step.expect || (step.allow !== undefined && res.status === step.allow.status);
    if (!accepted) {
      fail(`${step.id} ${step.method} ${step.path}: expected ${step.expect}${step.allow ? ` or ${step.allow.status}` : ""}, got ${res.status}: ${JSON.stringify(res.body).slice(0, 1000)}`);
    }

    let body = res.body;
    if (res.status === 200) {
      const checked = orderCheck(step, path, body);
      if (checked.problems.length > 0) fail(`${step.id} ${step.method} ${step.path}: list order is not comparable:\n  ${checked.problems.join("\n  ")}`);
      body = checked.body;
    }

    if (step.save) {
      const id = pick(body, step.save.from);
      if (typeof id !== "string") fail(`${step.id}: nothing to save as ${step.save.name} at ${step.save.from} (status ${res.status})`);
      saved[step.save.name] = id;
    }

    out.push({ id: step.id, request: `${step.method} ${step.path}`, status: res.status, body: normalize(body) });
  }

  const commit = execFileSync("git", ["rev-parse", "HEAD"], { encoding: "utf8" }).trim();
  return { steps, transcript: { meta: { capturedAt: started.toISOString(), commit }, steps: out } };
}

async function main() {
  const { command, flags } = parseArgs(process.argv.slice(2));
  if (command === "capture") {
    const base = checkBase(flags.base);
    if (!flags.out) fail("--out is required");
    const { transcript } = await runScenario(base);
    writeFileSync(flags.out, JSON.stringify(transcript, null, 2) + "\n");
    console.log(`captured ${transcript.steps.length} steps into ${flags.out}`);
    return;
  }
  if (command === "check") {
    const base = checkBase(flags.base);
    const golden = JSON.parse(readFileSync(flags.golden ?? DEFAULT_GOLDEN, "utf8")) as Transcript;
    const { transcript, steps } = await runScenario(base);
    const { diffs, allowed } = compareTranscripts(golden, transcript, steps);
    if (allowed.length > 0) console.log(`${allowed.length} allowed difference(s):\n  ${allowed.join("\n  ")}`);
    if (diffs.length > 0) {
      console.error(`${diffs.length} difference(s):\n${diffs.join("\n")}`);
      process.exitCode = 1;
      return;
    }
    console.log(`parity: ${transcript.steps.length} steps match the golden${allowed.length > 0 ? ` (${allowed.length} as allowed differences)` : ""}`);
    return;
  }
  fail(`Unknown command ${JSON.stringify(command)}; use capture or check`);
}

main().catch((error: unknown) => {
  console.error(error instanceof Abort ? `aborted: ${error.message}` : error);
  process.exitCode = 1;
});
