import { test } from "node:test";
import assert from "node:assert/strict";
import type { ApiResult } from "@/lib/data/api";
import { BrowserStore } from "@/lib/data/browser-store";
import { dispatch } from "@/lib/data/dispatch";
import { memoryStorage } from "@/lib/data/test-helpers";
import type { Recipe, ShoppingItem } from "@/types/figure/diet";
import type { RunLog, Workout, WorkoutLog } from "@/types/figure/fitness";
import { byteOrder, keptWorkoutId, listLimit, recipes, runLogs, shoppingItems, workoutLogs, workouts } from "./handlers";
import { figureRoutes } from "./routes";

const START = Date.parse("2026-11-17T15:00:00.000Z");
let tick = START;
let store = new BrowserStore(memoryStorage(), () => new Date(tick++));
const call = (method: string, url: string, body?: unknown, now?: Date): Promise<ApiResult> =>
  dispatch(figureRoutes, store, method, url, body, now);

const UNKNOWN = "b".repeat(24);
const BAD = "abc";
const F = "/api/figure";

test.beforeEach(() => {
  tick = START;
  store = new BrowserStore(memoryStorage(), () => new Date(tick++));
});

async function created<T>(method: string, url: string, body: unknown): Promise<T> {
  const res = await call(method, url, body);
  assert.equal(res.status, 201, JSON.stringify(res.body));
  return res.body as T;
}
const workout = (body: Record<string, unknown>) => created<Workout>("POST", `${F}/workouts`, body);
const log = (body: Record<string, unknown>) => created<WorkoutLog>("POST", `${F}/workout-logs`, { name: "Lift", ...body });
const run = (body: Record<string, unknown>) => created<RunLog>("POST", `${F}/runs`, { distance: 3, durationSeconds: 1500, ...body });
const recipe = (body: Record<string, unknown>) => created<Recipe>("POST", `${F}/recipes`, body);
const item = (body: Record<string, unknown>) => created<ShoppingItem>("POST", `${F}/shopping-items`, body);
const ex = (name: string, ...sets: [number, number, boolean?][]) => ({
  name,
  sets: sets.map(([reps, weight, done]) => (done === undefined ? { reps, weight } : { reps, weight, done })),
});

async function getBody<T>(url: string, now?: Date): Promise<T> {
  const res = await call("GET", url, undefined, now);
  assert.equal(res.status, 200, JSON.stringify(res.body));
  return res.body as T;
}

const strip = <T extends object>(doc: T) => {
  const { _id, createdAt, updatedAt, ...rest } = doc as T & { _id: unknown; createdAt: unknown; updatedAt: unknown };
  void _id;
  void createdAt;
  void updatedAt;
  return rest;
};

const NOT_FOUND = (what: string) => ({ status: 404, body: { error: `${what} not found` } });
const isValidation = (res: ApiResult) => res.status === 400 && (res.body as { error: string }).error === "Validation failed";

// ── Helpers ──

test("keptWorkoutId: 24 hex digits in either case, lowercased; anything else dropped", () => {
  assert.equal(keptWorkoutId("A".repeat(24)), "a".repeat(24));
  assert.equal(keptWorkoutId("parity-12chr"), undefined);
  assert.equal(keptWorkoutId("abc"), undefined);
  assert.equal(keptWorkoutId(""), undefined);
  assert.equal(keptWorkoutId(undefined), undefined);
});

test("listLimit: 0 and junk fall back, clamped to [1, max], fractions truncated as MongoDB did", () => {
  assert.equal(listLimit(null, 50, 200), 50);
  assert.equal(listLimit("0", 50, 200), 50);
  assert.equal(listLimit("junk", 50, 200), 50);
  assert.equal(listLimit("-5", 50, 200), 1);
  assert.equal(listLimit("500", 50, 200), 200);
  assert.equal(listLimit("2.5", 50, 200), 2);
  assert.equal(listLimit("0.5", 50, 200), 1);
});

test("byteOrder: code point order, uppercase before lowercase, astral after U+FFFF", () => {
  assert.ok(byteOrder("DEADLIFT", "Deadlift") < 0);
  assert.ok(byteOrder("Zucchini", "apple") < 0);
  assert.ok(byteOrder("a", "ab") < 0);
  assert.ok(byteOrder("\u{1F600}", "￿") > 0); // UTF-16 code units would say the opposite
  assert.equal(byteOrder("same", "same"), 0);
});

// ── Workouts ──

test("create workout: trims name and notes (exercise notes too), strips a client order, assigns order", async () => {
  const a = await workout({
    name: "  Push  ",
    notes: "  chest  ",
    order: 42,
    exercises: [{ name: " Bench ", targetSets: 3, targetReps: 8, notes: "  pause  " }],
  });
  assert.deepEqual(strip(a), {
    name: "Push",
    notes: "chest",
    exercises: [{ name: "Bench", targetSets: 3, targetReps: 8, notes: "pause" }],
    order: 0,
  });
  const b = await workout({ name: "Legs" });
  assert.deepEqual(strip(b), { name: "Legs", exercises: [], order: 1 });
  // Blank notes trim to "" and are kept, as Mongoose stored them
  assert.equal((await workout({ name: "C", notes: "   " })).notes, "");
});

test("create workout: validation and unparseable JSON are 400 and store nothing", async () => {
  assert.ok(isValidation(await call("POST", `${F}/workouts`, { name: "", exercises: [{ name: "x", targetSets: 0, targetReps: 1 }] })));
  assert.ok(isValidation(await call("POST", `${F}/workouts`, undefined)));
  assert.equal(await workouts(store).count(), 0);
});

test("list workouts: by order, then createdAt, then _id; a deleted top order is reused", async () => {
  const a = await workout({ name: "A" });
  const b = await workout({ name: "B" });
  await call("DELETE", `${F}/workouts/${b._id}`);
  const c = await workout({ name: "C" });
  assert.equal(c.order, 1);
  // Ties on order are settled by createdAt; ties on order and createdAt by _id
  tick = START + 1_000_000;
  const [x, y] = await workouts(store).insertMany([
    { name: "X", exercises: [], order: 0 },
    { name: "Y", exercises: [], order: 0 },
  ]);
  const byId = [x, y].sort((p, q) => (p._id < q._id ? -1 : 1)).map((w) => w.name);
  const list = await getBody<Workout[]>(`${F}/workouts`);
  assert.deepEqual(list.map((w) => w.name), ["A", ...byId, "C"]);
  assert.equal(list[0]._id, a._id);
});

test("get workout: found; unknown, malformed and uppercase ids are 404", async () => {
  const a = await workout({ name: "A" });
  assert.deepEqual((await call("GET", `${F}/workouts/${a._id}`)).body, a);
  for (const id of [UNKNOWN, BAD, a._id.toUpperCase()]) {
    assert.deepEqual(await call("GET", `${F}/workouts/${id}`), NOT_FOUND("Workout"));
  }
});

test("update workout: replaces exercises, omitted exercises → []; notes set trimmed", async () => {
  const a = await workout({ name: "A", notes: "old", exercises: [{ name: "Bench", targetSets: 3, targetReps: 8, targetWeight: 100 }] });
  const res = await call("PUT", `${F}/workouts/${a._id}`, { name: " A2 ", notes: "keep", exercises: [{ name: "Bench", targetSets: 3, targetReps: 8, notes: " n " }] });
  assert.equal(res.status, 200);
  assert.deepEqual(strip(res.body as Workout), { name: "A2", notes: "keep", order: 0, exercises: [{ name: "Bench", targetSets: 3, targetReps: 8, notes: "n" }] });
  const cleared = await call("PUT", `${F}/workouts/${a._id}`, { name: "A3", notes: "  new  " });
  assert.deepEqual((cleared.body as Workout).exercises, []);
  assert.equal((cleared.body as Workout).notes, "new");
});

test("update workout: omitted, empty or blank notes are removed (the form sends none when the field is emptied)", async () => {
  for (const notes of [undefined, "", "   "]) {
    const a = await workout({ name: "A", notes: "old" });
    const res = await call("PUT", `${F}/workouts/${a._id}`, { name: "A", notes });
    assert.equal(res.status, 200);
    assert.deepEqual(strip(res.body as Workout), { name: "A", order: a.order, exercises: [] }, `notes ${JSON.stringify(notes)}`);
    assert.deepEqual(await workouts(store).findById(a._id), res.body);
  }
});

test("update / delete workout: unknown and malformed ids 404; invalid body 400 leaves it unchanged", async () => {
  const a = await workout({ name: "A" });
  assert.deepEqual(await call("PUT", `${F}/workouts/${UNKNOWN}`, { name: "x" }), NOT_FOUND("Workout"));
  assert.deepEqual(await call("PUT", `${F}/workouts/${BAD}`, { name: "x" }), NOT_FOUND("Workout"));
  // A malformed id answers 404 before the body is read
  assert.deepEqual(await call("PUT", `${F}/workouts/${BAD}`, { name: "" }), NOT_FOUND("Workout"));
  assert.ok(isValidation(await call("PUT", `${F}/workouts/${a._id}`, { name: "" })));
  assert.ok(isValidation(await call("PUT", `${F}/workouts/${a._id}`, undefined)));
  assert.deepEqual(await workouts(store).findById(a._id), a);
  assert.deepEqual(await call("DELETE", `${F}/workouts/${UNKNOWN}`), NOT_FOUND("Workout"));
  assert.deepEqual(await call("DELETE", `${F}/workouts/${BAD}`), NOT_FOUND("Workout"));
  assert.deepEqual(await call("DELETE", `${F}/workouts/${a._id}`), { status: 200, body: { message: "Workout deleted" } });
  assert.equal(await workouts(store).count(), 0);
});

// ── Workout logs ──

test("create log: workoutId kept lowercased when 24 hex, dropped otherwise; set done defaults false; notes trimmed", async () => {
  const w = await workout({ name: "W" });
  const a = await log({ date: "2026-03-18", workoutId: w._id.toUpperCase(), notes: "  good  ", exercises: [ex("Bench", [8, 100]), { name: "Plank" }] });
  assert.deepEqual(strip(a), {
    date: "2026-03-18",
    workoutId: w._id,
    name: "Lift",
    notes: "good",
    exercises: [{ name: "Bench", sets: [{ reps: 8, weight: 100, done: false }] }, { name: "Plank", sets: [] }],
  });
  assert.equal((await log({ date: "2026-03-18", workoutId: UNKNOWN })).workoutId, UNKNOWN);
  for (const workoutId of [BAD, "parity-12chr", ""]) {
    assert.equal("workoutId" in (await log({ date: "2026-03-18", workoutId })), false);
  }
  assert.deepEqual((await log({ date: "2026-03-18" })).exercises, []);
});

test("create log: validation 400", async () => {
  assert.ok(isValidation(await call("POST", `${F}/workout-logs`, { date: "2026-3-18", name: "x" })));
  assert.ok(isValidation(await call("POST", `${F}/workout-logs`, undefined)));
  assert.equal(await workoutLogs(store).count(), 0);
});

test("list logs: newest first (date, createdAt, _id), by date or range; a malformed date falls back to the range", async () => {
  const a = await log({ date: "2026-03-10" });
  const b = await log({ date: "2026-03-18" });
  const c = await log({ date: "2026-03-18" });
  const d = await log({ date: "2026-02-01" });
  const ids = (list: WorkoutLog[]) => list.map((l) => l._id);
  assert.deepEqual(ids(await getBody(`${F}/workout-logs`)), [c._id, b._id, a._id, d._id]);
  assert.deepEqual(ids(await getBody(`${F}/workout-logs?date=2026-03-18`)), [c._id, b._id]);
  assert.deepEqual(ids(await getBody(`${F}/workout-logs?startDate=2026-03-01&endDate=2026-03-17`)), [a._id]);
  assert.deepEqual(ids(await getBody(`${F}/workout-logs?date=2026-3-18&startDate=2026-01-01&endDate=2026-02-28`)), [d._id]);
  assert.deepEqual(ids(await getBody(`${F}/workout-logs?limit=2`)), [c._id, b._id]);
  assert.deepEqual(ids(await getBody(`${F}/workout-logs?limit=-3`)), [c._id]);
  assert.deepEqual(ids(await getBody(`${F}/workout-logs?limit=2.5`)), [c._id, b._id]);
  // Same date and createdAt: _id descending
  tick = START + 1_000_000;
  const tied = await workoutLogs(store).insertMany([
    { date: "2027-01-01", name: "x", exercises: [] },
    { date: "2027-01-01", name: "y", exercises: [] },
  ]);
  const expected = tied.map((l) => l._id).sort().reverse();
  assert.deepEqual(ids(await getBody(`${F}/workout-logs?limit=2`)), expected);
});

test("list logs: limit 0 and junk fall back to 50, cap 200", async () => {
  await workoutLogs(store).insertMany(
    Array.from({ length: 210 }, (_, i) => ({ date: `2026-01-${String((i % 28) + 1).padStart(2, "0")}`, name: `L${i}`, exercises: [] })),
  );
  assert.equal((await getBody<WorkoutLog[]>(`${F}/workout-logs`)).length, 50);
  assert.equal((await getBody<WorkoutLog[]>(`${F}/workout-logs?limit=0`)).length, 50);
  assert.equal((await getBody<WorkoutLog[]>(`${F}/workout-logs?limit=junk`)).length, 50);
  assert.equal((await getBody<WorkoutLog[]>(`${F}/workout-logs?limit=199`)).length, 199);
  assert.equal((await getBody<WorkoutLog[]>(`${F}/workout-logs?limit=500`)).length, 200);
});

test("get log: found; unknown and malformed ids 404", async () => {
  const a = await log({ date: "2026-03-18" });
  assert.deepEqual((await call("GET", `${F}/workout-logs/${a._id}`)).body, a);
  assert.deepEqual(await call("GET", `${F}/workout-logs/${UNKNOWN}`), NOT_FOUND("Workout log"));
  assert.deepEqual(await call("GET", `${F}/workout-logs/${BAD}`), NOT_FOUND("Workout log"));
});

test("update log: a valid workoutId is set lowercased, a missing or malformed one removed; exercises omitted → []", async () => {
  const w = await workout({ name: "W" });
  const a = await log({ date: "2026-03-18", workoutId: w._id, exercises: [ex("Bench", [1, 1])] });
  const res = await call("PUT", `${F}/workout-logs/${a._id}`, { date: "2026-03-19", name: " Moved ", workoutId: BAD });
  assert.equal(res.status, 200);
  assert.deepEqual(strip(res.body as WorkoutLog), { date: "2026-03-19", name: "Moved", exercises: [] });
  const set = await call("PUT", `${F}/workout-logs/${a._id}`, { date: "2026-03-19", name: "M", workoutId: w._id.toUpperCase(), notes: "  n  " });
  assert.equal((set.body as WorkoutLog).workoutId, w._id);
  assert.equal((set.body as WorkoutLog).notes, "n");
});

test("update log: omitted, empty or blank notes are removed (the editor sends none when the field is emptied)", async () => {
  const w = await workout({ name: "W" });
  for (const notes of [undefined, "", "   "]) {
    const a = await log({ date: "2026-03-18", notes: "old", workoutId: w._id });
    const res = await call("PUT", `${F}/workout-logs/${a._id}`, { date: "2026-03-18", name: "Lift", notes, workoutId: w._id });
    assert.equal(res.status, 200);
    assert.deepEqual(strip(res.body as WorkoutLog), { date: "2026-03-18", name: "Lift", exercises: [], workoutId: w._id }, `notes ${JSON.stringify(notes)}`);
    // Without a workoutId both fields go
    const both = await call("PUT", `${F}/workout-logs/${a._id}`, { date: "2026-03-18", name: "Lift", notes });
    assert.deepEqual(strip(both.body as WorkoutLog), { date: "2026-03-18", name: "Lift", exercises: [] });
    assert.deepEqual(await workoutLogs(store).findById(a._id), both.body);
  }
});

test("update / delete log: unknown and malformed ids 404; invalid body 400 leaves it unchanged", async () => {
  const a = await log({ date: "2026-03-18" });
  assert.deepEqual(await call("PUT", `${F}/workout-logs/${UNKNOWN}`, { date: "2026-03-18", name: "x" }), NOT_FOUND("Workout log"));
  assert.deepEqual(await call("PUT", `${F}/workout-logs/${BAD}`, { date: "2026-03-18", name: "x" }), NOT_FOUND("Workout log"));
  assert.ok(isValidation(await call("PUT", `${F}/workout-logs/${a._id}`, { date: "bad", name: "x" })));
  assert.ok(isValidation(await call("PUT", `${F}/workout-logs/${a._id}`, undefined)));
  assert.deepEqual(await workoutLogs(store).findById(a._id), a);
  assert.deepEqual(await call("DELETE", `${F}/workout-logs/${UNKNOWN}`), NOT_FOUND("Workout log"));
  assert.deepEqual(await call("DELETE", `${F}/workout-logs/${BAD}`), NOT_FOUND("Workout log"));
  assert.deepEqual(await call("DELETE", `${F}/workout-logs/${a._id}`), { status: 200, body: { message: "Workout log deleted" } });
});

// ── Runs ──

test("create run: type defaults to easy, notes trimmed; validation 400", async () => {
  const a = await run({ date: "2026-03-16", notes: "  park  " });
  assert.deepEqual(strip(a), { date: "2026-03-16", distance: 3, durationSeconds: 1500, type: "easy", notes: "park" });
  assert.ok(isValidation(await call("POST", `${F}/runs`, { date: "2026-03-16", distance: 0, durationSeconds: 1 })));
  assert.ok(isValidation(await call("POST", `${F}/runs`, undefined)));
  assert.equal(await runLogs(store).count(), 1);
});

test("list runs: newest first, range; limit junk falls back to 100, cap 500", async () => {
  await runLogs(store).insertMany(
    Array.from({ length: 510 }, (_, i) => ({ date: `2025-${String((i % 12) + 1).padStart(2, "0")}-01`, distance: 1, durationSeconds: 600, type: "easy" as const })),
  );
  const latest = await run({ date: "2026-03-16" });
  assert.equal((await getBody<RunLog[]>(`${F}/runs`)).length, 100);
  assert.equal((await getBody<RunLog[]>(`${F}/runs?limit=junk`)).length, 100);
  assert.equal((await getBody<RunLog[]>(`${F}/runs?limit=0`)).length, 100);
  assert.equal((await getBody<RunLog[]>(`${F}/runs?limit=1000`)).length, 500);
  assert.equal((await getBody<RunLog[]>(`${F}/runs?limit=-1`)).length, 1);
  assert.deepEqual(await getBody(`${F}/runs?startDate=2026-01-01&limit=5`), [latest]);
  assert.equal((await getBody<RunLog[]>(`${F}/runs?startDate=2026-1-1&endDate=2025-01-01&limit=1000`)).length, 43);
});

test("update run: notes set trimmed or removed; omitted type back to easy; 404s and 400s", async () => {
  const a = await run({ date: "2026-03-16", type: "long", notes: "x" });
  const set = await call("PUT", `${F}/runs/${a._id}`, { date: "2026-03-16", distance: 4, durationSeconds: 1600, notes: "  route  " });
  assert.deepEqual(strip(set.body as RunLog), { date: "2026-03-16", distance: 4, durationSeconds: 1600, type: "easy", notes: "route" });
  const unset = await call("PUT", `${F}/runs/${a._id}`, { date: "2026-03-16", distance: 4, durationSeconds: 1600, type: "race", notes: "" });
  assert.deepEqual(strip(unset.body as RunLog), { date: "2026-03-16", distance: 4, durationSeconds: 1600, type: "race" });
  const body = { date: "2026-03-16", distance: 1, durationSeconds: 1 };
  assert.deepEqual(await call("PUT", `${F}/runs/${UNKNOWN}`, body), NOT_FOUND("Run"));
  assert.deepEqual(await call("PUT", `${F}/runs/${BAD}`, body), NOT_FOUND("Run"));
  assert.ok(isValidation(await call("PUT", `${F}/runs/${a._id}`, { ...body, distance: 0 })));
  assert.ok(isValidation(await call("PUT", `${F}/runs/${a._id}`, undefined)));
  assert.deepEqual(await call("DELETE", `${F}/runs/${UNKNOWN}`), NOT_FOUND("Run"));
  assert.deepEqual(await call("DELETE", `${F}/runs/${BAD}`), NOT_FOUND("Run"));
  assert.deepEqual(await call("DELETE", `${F}/runs/${a._id}`), { status: 200, body: { message: "Run deleted" } });
});

// ── Exercise names ──

test("names: workouts' spellings before logs', each source in byte order; first per lowercased name; sorted with localeCompare", async () => {
  await workout({ name: "W", exercises: [{ name: "squat", targetSets: 1, targetReps: 1 }, { name: "Row", targetSets: 1, targetReps: 1 }] });
  await workout({ name: "W2", exercises: [{ name: "row", targetSets: 1, targetReps: 1 }] });
  await log({ date: "2026-03-01", exercises: [ex("Squat"), ex("Deadlift"), ex("Plank")] });
  await log({ date: "2026-03-02", exercises: [ex("DEADLIFT"), ex("Curl (EZ bar)")] });
  // "Row" (byte order before "row") wins within workouts; "squat" (a workout's) over the log's "Squat";
  // "DEADLIFT" before "Deadlift" in byte order, though inserted later
  assert.deepEqual(await getBody(`${F}/exercises/names`), ["Curl (EZ bar)", "DEADLIFT", "Plank", "Row", "squat"]);
});

test("names: empty when nothing is stored", async () => {
  assert.deepEqual(await getBody(`${F}/exercises/names`), []);
});

// ── Exercise progress ──

test("progress: no name → []; whole name, any case, surrounding spaces; metacharacters literal; undone sets left out", async () => {
  await log({ date: "2026-03-10", exercises: [ex("Bench Press", [5, 100, true], [5, 200])] });
  await log({ date: "2026-03-01", exercises: [ex("  bench press  ", [5, 90, true])] });
  await log({ date: "2026-03-05", exercises: [ex("Bench Press Incline", [5, 500, true])] });
  await log({ date: "2026-03-06", exercises: [ex("Curl (EZ bar)", [10, 40, true]), ex("Curl EZ bar", [10, 99, true])] });
  await log({ date: "2026-03-07", exercises: [ex("1x5 rep squat", [5, 100, true])] });
  assert.deepEqual(await getBody(`${F}/exercises/progress`), []);
  assert.deepEqual(await getBody(`${F}/exercises/progress?name=%20%20`), []);
  const bench = await getBody<{ date: string; topWeight: number }[]>(`${F}/exercises/progress?name=${encodeURIComponent("  BENCH press ")}`);
  assert.deepEqual(bench.map((p) => [p.date, p.topWeight]), [["2026-03-01", 90], ["2026-03-10", 100]]);
  const curl = await getBody<{ date: string; topWeight: number }[]>(`${F}/exercises/progress?name=${encodeURIComponent("Curl (EZ bar)")}`);
  assert.deepEqual(curl.map((p) => [p.date, p.topWeight]), [["2026-03-06", 40]]);
  assert.deepEqual(await getBody(`${F}/exercises/progress?name=1.5%20rep%20squat`), []);
  const since = await getBody<{ date: string }[]>(`${F}/exercises/progress?name=bench%20press&startDate=2026-03-10`);
  assert.deepEqual(since.map((p) => p.date), ["2026-03-10"]);
  const junk = await getBody<{ date: string }[]>(`${F}/exercises/progress?name=bench%20press&startDate=2026-3-10`);
  assert.equal(junk.length, 2);
});

// ── Exercise history ──

type History = Record<string, { name: string; date: string; sets: unknown[] }>;

test("history: no names → {}; newest first per lowercased name; before inclusive; metacharacters literal; stored spelling", async () => {
  await log({ date: "2026-03-01", exercises: [ex("Deadlift", [5, 200, true])] });
  await log({ date: "2026-03-05", exercises: [ex("DEADLIFT", [5, 210, true]), ex("Curl EZ bar", [1, 1])] });
  await log({ date: "2026-03-09", exercises: [ex("Bench", [1, 1]), ex("bench", [2, 2])] });
  assert.deepEqual(await getBody(`${F}/exercises/history`), {});
  assert.deepEqual(await getBody(`${F}/exercises/history?name=%20`), {});
  const h = await getBody<History>(`${F}/exercises/history?name=deadlift&name=%20BENCH%20&name=Curl%20(EZ%20bar)&name=deadlift`);
  assert.deepEqual(Object.keys(h).sort(), ["bench", "deadlift"]);
  assert.deepEqual(h.deadlift, { name: "DEADLIFT", date: "2026-03-05", sets: [{ reps: 5, weight: 210, done: true }] });
  // Within one log the first matching exercise wins
  assert.deepEqual(h.bench.sets, [{ reps: 1, weight: 1, done: false }]);
  const before = await getBody<History>(`${F}/exercises/history?name=Deadlift&before=2026-03-04`);
  assert.equal(before.deadlift.date, "2026-03-01");
  assert.equal((await getBody<History>(`${F}/exercises/history?name=Deadlift&before=2026-03-05`)).deadlift.date, "2026-03-05");
  // A malformed before is ignored
  assert.equal((await getBody<History>(`${F}/exercises/history?name=Deadlift&before=2026-3-4`)).deadlift.date, "2026-03-05");
});

test("history: excludeLogId skips that log by exact id; an uppercase id excludes nothing", async () => {
  await log({ date: "2026-03-01", exercises: [ex("Row", [1, 1])] });
  const newer = await log({ date: "2026-03-02", exercises: [ex("Row", [2, 2])] });
  assert.equal((await getBody<History>(`${F}/exercises/history?name=Row&excludeLogId=${newer._id}`)).row.date, "2026-03-01");
  assert.equal((await getBody<History>(`${F}/exercises/history?name=Row&excludeLogId=${newer._id.toUpperCase()}`)).row.date, "2026-03-02");
});

test("history: the window is the newest 200 matching logs; an excluded log still counts toward the 200", async () => {
  // 1 old log with "Old", then 200 newer logs with "Row" (and the newest of those also with "Old")
  await workoutLogs(store).insert({ date: "2025-01-01", name: "x", exercises: [ex("Old", [9, 9, true])] } as never);
  const newer = Array.from({ length: 199 }, (_, i) => ({
    date: `2026-01-${String((i % 28) + 1).padStart(2, "0")}`,
    name: `n${i}`,
    exercises: [ex("Row", [1, 1, true])],
  }));
  await workoutLogs(store).insertMany(newer as never[]);
  const newest = await log({ date: "2026-02-01", exercises: [ex("Row", [2, 2, true]), ex("Old", [3, 3, true])] });
  // 201 logs match "Row" or "Old": the oldest ("Old" on 2025-01-01) falls outside the window
  const all = await getBody<History>(`${F}/exercises/history?name=Row&name=Old`);
  assert.equal(all.old.date, "2026-02-01");
  // Excluding the newest still leaves it in the 200: the 2025 log stays out, so "Old" has no entry
  const excluded = await getBody<History>(`${F}/exercises/history?name=Row&name=Old&excludeLogId=${newest._id}`);
  assert.equal(excluded.old, undefined);
  assert.equal(excluded.row.date, "2026-01-28");
  // Only "Old" asked: two matching logs, both in the window
  const only = await getBody<History>(`${F}/exercises/history?name=Old&excludeLogId=${newest._id}`);
  assert.equal(only.old.date, "2025-01-01");
});

test("history: logs tied on date and createdAt are settled by _id descending", async () => {
  tick = START;
  const tied = await workoutLogs(store).insertMany([
    { date: "2026-03-01", name: "a", exercises: [ex("Row", [1, 1])] },
    { date: "2026-03-01", name: "b", exercises: [ex("Row", [2, 2])] },
  ] as never[]);
  const winner = [...tied].sort((p, q) => (p._id < q._id ? 1 : -1))[0];
  assert.deepEqual((await getBody<History>(`${F}/exercises/history?name=row`)).row.sets, winner.exercises[0].sets);
});

// ── Stats ──

test("stats: weeks clamped (1 → 2, 500 → 104, junk → 12); today from the query, else the request clock", async () => {
  await log({ date: "2026-03-18", exercises: [ex("Bench", [5, 100, true])] });
  await log({ date: "2026-03-17", exercises: [ex("bench", [5, 100, true])] });
  await run({ date: "2026-03-16" });
  const s = await getBody<{ range: { start: string; end: string; weeks: number }; streak: { current: number }; topExercises: { name: string; sessions: number }[] }>(
    `${F}/stats?today=2026-03-18&weeks=1`,
  );
  assert.deepEqual(s.range, { start: "2026-03-09", end: "2026-03-18", weeks: 2 });
  assert.equal(s.streak.current, 3);
  // Newest first: the 2026-03-18 log's "Bench" names the exercise
  assert.deepEqual(s.topExercises, [{ name: "Bench", sessions: 2 }]);
  assert.equal((await getBody<{ range: { weeks: number } }>(`${F}/stats?today=2026-03-18&weeks=500`)).range.weeks, 104);
  assert.equal((await getBody<{ range: { weeks: number } }>(`${F}/stats?today=2026-03-18&weeks=junk`)).range.weeks, 12);
  const clock = await getBody<{ range: { end: string } }>(`${F}/stats?today=2026-3-18`, new Date(2026, 2, 20, 12));
  assert.equal(clock.range.end, "2026-03-20");
});

// MongoDB answered the stats queries from the { date: -1, createdAt: -1 } index (observed on the
// unconverted routes: these two inputs gave "row" and the distance-5 pace first)
test("stats: logs are read newest first, so the newest log's casing names an exercise (the older log inserted first)", async () => {
  await log({ date: "2026-03-16", exercises: [ex("ROW", [1, 1, true])] });
  await log({ date: "2026-03-17", exercises: [ex("row", [1, 1, true])] });
  const s = await getBody<{ topExercises: { name: string; sessions: number }[] }>(`${F}/stats?today=2026-03-18`);
  assert.deepEqual(s.topExercises, [{ name: "row", sessions: 2 }]);
});

test("stats: two runs on one date list their paces newest created first", async () => {
  await run({ date: "2026-03-16", distance: 3, durationSeconds: 1500 });
  await run({ date: "2026-03-16", distance: 5, durationSeconds: 2400 });
  await run({ date: "2026-03-15", distance: 4, durationSeconds: 2000 });
  const s = await getBody<{ paces: { date: string; distance: number }[] }>(`${F}/stats?today=2026-03-18`);
  assert.deepEqual(s.paces.map((p) => [p.date, p.distance]), [["2026-03-15", 4], ["2026-03-16", 5], ["2026-03-16", 3]]);
});

// ── Recipes ──

test("create recipe: defaults and trims; validation 400", async () => {
  const r = await recipe({ name: "  Soup  ", ingredients: [{ name: " Onion ", unit: "  " }], tags: [" quick "] });
  assert.deepEqual(strip(r), { name: "Soup", ingredients: [{ name: "Onion", unit: "" }], instructions: "", tags: ["quick"] });
  assert.ok(isValidation(await call("POST", `${F}/recipes`, { name: " ", servings: 0 })));
  assert.ok(isValidation(await call("POST", `${F}/recipes`, undefined)));
  assert.equal(await recipes(store).count(), 1);
});

test("list recipes: by name in byte order, ties by _id; ?tag= exact", async () => {
  await recipe({ name: "apple", tags: ["quick"] });
  await recipe({ name: "Zucchini" });
  tick = START + 1_000_000;
  const twins = await recipes(store).insertMany([
    { name: "Banana", ingredients: [], instructions: "", tags: [] },
    { name: "Banana", ingredients: [], instructions: "", tags: [] },
  ]);
  const list = await getBody<Recipe[]>(`${F}/recipes`);
  assert.deepEqual(list.map((r) => r.name), ["Banana", "Banana", "Zucchini", "apple"]);
  assert.deepEqual(list.slice(0, 2).map((r) => r._id), twins.map((r) => r._id).sort());
  assert.deepEqual((await getBody<Recipe[]>(`${F}/recipes?tag=quick`)).map((r) => r.name), ["apple"]);
  assert.deepEqual(await getBody(`${F}/recipes?tag=QUICK`), []);
  assert.equal((await getBody<Recipe[]>(`${F}/recipes?tag=`)).length, 4);
});

test("get / update / delete recipe: servings set or removed, omitted instructions and tags reset; 404s and 400s", async () => {
  const r = await recipe({ name: "Soup", servings: 2, instructions: "Boil.", tags: ["a"] });
  assert.deepEqual((await call("GET", `${F}/recipes/${r._id}`)).body, r);
  assert.deepEqual(await call("GET", `${F}/recipes/${BAD}`), NOT_FOUND("Recipe"));
  assert.deepEqual(await call("GET", `${F}/recipes/${UNKNOWN}`), NOT_FOUND("Recipe"));
  const set = await call("PUT", `${F}/recipes/${r._id}`, { name: "Soup", servings: 4 });
  assert.deepEqual(strip(set.body as Recipe), { name: "Soup", servings: 4, ingredients: [], instructions: "", tags: [] });
  const unset = await call("PUT", `${F}/recipes/${r._id}`, { name: "Soup" });
  assert.equal("servings" in (unset.body as Recipe), false);
  assert.deepEqual(await call("PUT", `${F}/recipes/${UNKNOWN}`, { name: "x" }), NOT_FOUND("Recipe"));
  assert.deepEqual(await call("PUT", `${F}/recipes/${BAD}`, { name: "x" }), NOT_FOUND("Recipe"));
  assert.ok(isValidation(await call("PUT", `${F}/recipes/${r._id}`, { name: "" })));
  assert.ok(isValidation(await call("PUT", `${F}/recipes/${r._id}`, undefined)));
  assert.deepEqual(await call("DELETE", `${F}/recipes/${UNKNOWN}`), NOT_FOUND("Recipe"));
  assert.deepEqual(await call("DELETE", `${F}/recipes/${BAD}`), NOT_FOUND("Recipe"));
  assert.deepEqual(await call("DELETE", `${F}/recipes/${r._id}`), { status: 200, body: { message: "Recipe deleted" } });
});

// ── Shopping list ──

test("shopping items: create trims, defaults checked, order continues; list unchecked by order, then checked", async () => {
  const a = await item({ name: "  Milk  ", unit: "", checked: true });
  assert.deepEqual(strip(a), { name: "Milk", unit: "", checked: true, order: 0 });
  const b = await item({ name: "Eggs", quantity: 12 });
  assert.deepEqual(strip(b), { name: "Eggs", quantity: 12, checked: false, order: 1 });
  const c = await item({ name: "Salt" });
  assert.deepEqual((await getBody<ShoppingItem[]>(`${F}/shopping-items`)).map((i) => i.name), ["Eggs", "Salt", "Milk"]);
  assert.ok(isValidation(await call("POST", `${F}/shopping-items`, { name: "" })));
  assert.ok(isValidation(await call("POST", `${F}/shopping-items`, undefined)));
  void c;
});

test("update shopping item: checked alone; 404s and 400s", async () => {
  const a = await item({ name: "Eggs", quantity: 2 });
  const res = await call("PUT", `${F}/shopping-items/${a._id}`, { checked: true });
  assert.deepEqual(strip(res.body as ShoppingItem), { name: "Eggs", quantity: 2, checked: true, order: 0 });
  assert.deepEqual(await call("PUT", `${F}/shopping-items/${UNKNOWN}`, { checked: true }), NOT_FOUND("Shopping item"));
  assert.deepEqual(await call("PUT", `${F}/shopping-items/${BAD}`, { checked: true }), NOT_FOUND("Shopping item"));
  assert.ok(isValidation(await call("PUT", `${F}/shopping-items/${a._id}`, { quantity: -2 })));
  assert.ok(isValidation(await call("PUT", `${F}/shopping-items/${a._id}`, undefined)));
});

test("update shopping item: a field absent from the body is left unchanged (a renamed checked item stays checked)", async () => {
  const a = await item({ name: "Eggs", quantity: 12, unit: "pcs", checked: true });
  const res = await call("PUT", `${F}/shopping-items/${a._id}`, { name: "  eggs  " });
  assert.equal(res.status, 200);
  assert.deepEqual(strip(res.body as ShoppingItem), { name: "eggs", quantity: 12, unit: "pcs", checked: true, order: 0 });
  const empty = await call("PUT", `${F}/shopping-items/${a._id}`, {});
  assert.deepEqual(strip(empty.body as ShoppingItem), { name: "eggs", quantity: 12, unit: "pcs", checked: true, order: 0 });
  // POST still defaults checked to false
  assert.equal((await item({ name: "Milk" })).checked, false);
});

test("update shopping item: quantity null and an empty or blank unit remove the field; other values set", async () => {
  const a = await item({ name: "Flour", quantity: 2, unit: "cups" });
  const cleared = await call("PUT", `${F}/shopping-items/${a._id}`, { quantity: null, unit: "" });
  assert.equal(cleared.status, 200);
  assert.deepEqual(strip(cleared.body as ShoppingItem), { name: "Flour", checked: false, order: 0 });
  assert.deepEqual(await shoppingItems(store).findById(a._id), cleared.body);
  const set = await call("PUT", `${F}/shopping-items/${a._id}`, { quantity: 3, unit: " kg " });
  assert.deepEqual(strip(set.body as ShoppingItem), { name: "Flour", quantity: 3, unit: "kg", checked: false, order: 0 });
  const blank = await call("PUT", `${F}/shopping-items/${a._id}`, { unit: "   " });
  assert.deepEqual(strip(blank.body as ShoppingItem), { name: "Flour", quantity: 3, checked: false, order: 0 });
});

test("update shopping item: an invalid field is 400 and nothing is written, the clearing fields included", async () => {
  const a = await item({ name: "Flour", quantity: 2, unit: "cups", checked: true });
  for (const body of [{ quantity: null, unit: "", name: "" }, { unit: null }, { checked: null }, { name: null }, { quantity: -1, unit: "" }]) {
    assert.ok(isValidation(await call("PUT", `${F}/shopping-items/${a._id}`, body)), JSON.stringify(body));
  }
  assert.deepEqual(await shoppingItems(store).findById(a._id), a);
});

test("delete shopping item and clear-checked", async () => {
  const a = await item({ name: "A", checked: true });
  await item({ name: "B", checked: true });
  const c = await item({ name: "C" });
  assert.deepEqual(await call("DELETE", `${F}/shopping-items/${UNKNOWN}`), NOT_FOUND("Shopping item"));
  assert.deepEqual(await call("DELETE", `${F}/shopping-items/${BAD}`), NOT_FOUND("Shopping item"));
  assert.deepEqual(await call("DELETE", `${F}/shopping-items/${a._id}`), { status: 200, body: { message: "Shopping item deleted" } });
  assert.deepEqual(await call("POST", `${F}/shopping-items/clear-checked`), { status: 200, body: { deleted: 1 } });
  assert.deepEqual(await call("POST", `${F}/shopping-items/clear-checked`), { status: 200, body: { deleted: 0 } });
  assert.deepEqual((await getBody<ShoppingItem[]>(`${F}/shopping-items`)).map((i) => i._id), [c._id]);
});

// ── Add to list ──

test("add-to-list: merges by name and unit ignoring case, sums quantities, skips checked items, adds the rest after the last order", async () => {
  await item({ name: "Milk", quantity: 1, unit: "cup", checked: true });
  const oats = await item({ name: "Oats", quantity: 2, unit: "CUP" });
  const salt = await item({ name: "salt (Kosher)", unit: "Pinch" });
  const r = await recipe({
    name: "Oats",
    ingredients: [
      { name: "Oats", quantity: 1, unit: "cup" },
      { name: "Milk", quantity: 1, unit: "cup" },
      { name: "Banana" },
      { name: "Salt (kosher)", quantity: 1, unit: "pinch" },
      { name: "Salt kosher", quantity: 1, unit: "pinch" },
    ],
  });
  assert.deepEqual(await call("POST", `${F}/recipes/${r._id}/add-to-list`), { status: 200, body: { added: 3, merged: 2 } });
  const list = await getBody<ShoppingItem[]>(`${F}/shopping-items`);
  const byName = (n: string) => list.filter((i) => i.name === n);
  assert.equal(byName("Oats")[0].quantity, 3);
  assert.equal(byName("Oats")[0]._id, oats._id);
  assert.equal(byName("salt (Kosher)")[0].quantity, 1);
  assert.equal(byName("salt (Kosher)")[0]._id, salt._id);
  assert.deepEqual(byName("Milk").map((i) => i.checked), [false, true]);
  const banana = byName("Banana")[0];
  assert.deepEqual(strip(banana), { name: "Banana", checked: false, recipeId: r._id, order: 4, recipeName: "Oats" });
  assert.deepEqual(byName("Milk")[0].order, 3);
  assert.deepEqual(byName("Salt kosher")[0].order, 5);
});

test("add-to-list: no unit matches a missing, empty or null unit; no quantity leaves the item untouched; ingredients merge into each other", async () => {
  // A null unit cannot come through the API; written to the store directly
  tick = START + 100;
  await shoppingItems(store).insert({ name: "Leek", unit: null, checked: false, order: 0 } as never);
  const onion = await item({ name: "Onion", unit: "" });
  await item({ name: "onion", quantity: 1 });
  const r = await recipe({
    name: "Soup",
    ingredients: [
      { name: "ONION", quantity: 3 },
      { name: "Onion", unit: "  " },
      { name: "leek", quantity: 2 },
      { name: "Shallot" },
      { name: "shallot", quantity: 2 },
    ],
  });
  const before = await shoppingItems(store).findById(onion._id);
  assert.deepEqual(await call("POST", `${F}/recipes/${r._id}/add-to-list`), { status: 200, body: { added: 1, merged: 4 } });
  const list = await getBody<ShoppingItem[]>(`${F}/shopping-items`);
  // The matching item with the lowest order ("Onion", order 1; "onion" is 2) takes both onion ingredients
  const merged = list.find((i) => i._id === onion._id)!;
  assert.equal(merged.quantity, 3);
  assert.notEqual(merged.updatedAt, before!.updatedAt);
  assert.equal(list.find((i) => i.name === "onion")!.quantity, 1);
  assert.equal(list.find((i) => i.name === "Leek")!.quantity, 2);
  const shallot = list.filter((i) => i.name.toLowerCase() === "shallot");
  assert.deepEqual(shallot.map((i) => [i.name, i.quantity]), [["Shallot", 2]]);
  assert.equal(shallot[0].order, 3);
  assert.equal("unit" in shallot[0], false);
});

test("add-to-list: an ingredient without quantity, or with 0 on an item that has one, writes nothing", async () => {
  const eggs = await item({ name: "Eggs", quantity: 2 });
  const r = await recipe({ name: "R", ingredients: [{ name: "eggs" }, { name: "EGGS", quantity: 0 }] });
  assert.deepEqual((await call("POST", `${F}/recipes/${r._id}/add-to-list`)).body, { added: 0, merged: 2 });
  assert.deepEqual(await shoppingItems(store).findById(eggs._id), eggs);
});

test("add-to-list: when several items match, the lowest order wins (as MongoDB's { checked, order } index gave), then createdAt, then _id", async () => {
  const older = await item({ name: "kale" });
  await shoppingItems(store).updateById(older._id, { $set: { order: 9 } });
  const lower = await shoppingItems(store).insert({ name: "Kale", checked: false, order: 3 } as never);
  const r = await recipe({ name: "R", ingredients: [{ name: "KALE", quantity: 1 }] });
  await call("POST", `${F}/recipes/${r._id}/add-to-list`);
  assert.equal((await shoppingItems(store).findById(lower._id))!.quantity, 1);
  assert.equal((await shoppingItems(store).findById(older._id))!.quantity, undefined);

  // Tied on order: the older createdAt; tied on order and createdAt: the lower _id
  tick = START + 10_000;
  const later = await shoppingItems(store).insert({ name: "Chard", checked: false, order: 1 } as never);
  tick = START + 5_000;
  const earlier = await shoppingItems(store).insert({ name: "chard", checked: false, order: 1 } as never);
  tick = START + 20_000;
  const twins = await shoppingItems(store).insertMany([
    { name: "Leek", checked: false, order: 0 },
    { name: "leek", checked: false, order: 0 },
  ] as never[]);
  const r2 = await recipe({ name: "R2", ingredients: [{ name: "CHARD", quantity: 1 }, { name: "LEEK", quantity: 1 }] });
  await call("POST", `${F}/recipes/${r2._id}/add-to-list`);
  assert.equal((await shoppingItems(store).findById(earlier._id))!.quantity, 1);
  assert.equal((await shoppingItems(store).findById(later._id))!.quantity, undefined);
  const target = [...twins].sort((p, q) => (p._id < q._id ? -1 : 1))[0];
  assert.equal((await shoppingItems(store).findById(target._id))!.quantity, 1);
});

test("add-to-list: unknown and malformed recipe ids 404; items stay without recipeName once the recipe is deleted", async () => {
  assert.deepEqual(await call("POST", `${F}/recipes/${UNKNOWN}/add-to-list`), NOT_FOUND("Recipe"));
  assert.deepEqual(await call("POST", `${F}/recipes/${BAD}/add-to-list`), NOT_FOUND("Recipe"));
  const r = await recipe({ name: "Salad", ingredients: [{ name: "Kale" }] });
  await call("POST", `${F}/recipes/${r._id}/add-to-list`);
  assert.equal((await getBody<ShoppingItem[]>(`${F}/shopping-items`))[0].recipeName, "Salad");
  await call("DELETE", `${F}/recipes/${r._id}`);
  const [kale] = await getBody<ShoppingItem[]>(`${F}/shopping-items`);
  assert.equal(kale.recipeId, r._id);
  assert.equal("recipeName" in kale, false);
});
