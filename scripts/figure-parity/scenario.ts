// The Figure parity scenario: an ordered list of requests that drives every Figure route (workouts,
// workout logs, runs, exercise names / progress / history, stats, recipes, shopping list) from an
// empty database. Pure: no clock, no network.
//
// `{name}` in `path` and in any string inside `body` is replaced with the id saved under that name;
// `{unknown}` is a well-formed id that matches nothing (UNKNOWN_ID). Saving goes through `rememberId`,
// which also saves `{nameUpper}`: the same id in uppercase hex. `save.from` is a dot path into the
// response body. `expect` is the status today's (unconverted) routes answer. `allow` marks a step whose
// status is an intended difference after the conversion: D1a (a path id the converted code does not
// recognise, here an uppercase hex id, answers the route's 404) and D1c (unparseable JSON body → 400).
// A run on converted code may answer `allow.status` (with `allow.error`) instead, and nothing else.
//
// Every date is a fixed `yyyy-MM-dd` string and every stats step passes `today=2026-03-18` (a
// Wednesday; its week starts Monday 2026-03-16), so the transcript does not depend on the day it is
// recorded. Lists the routes sort with a tie-breaker that a timestamp settles (logs and runs by
// `date` desc, `createdAt` desc; workouts by `order`, `createdAt`) are checked by the runner, which
// also waits a few milliseconds after each step so no two documents share a `createdAt`.
//
// Exercise names are chosen so that answers do not depend on order MongoDB leaves undefined, except
// where noted (`not guaranteed:` comments; listed in the Task 1 report):
//   - workouts hold "bench press" (lowercase), logs hold "Bench Press": GET names shows which wins;
//   - logs alone hold "Deadlift" (L04, inserted first) and "DEADLIFT" (L05): the log index on
//     `exercises.name` lists "DEADLIFT" first, insertion order would list "Deadlift" first;
//   - "1x5 rep squat" and "Curl EZ bar" are decoys that an unescaped regex for "1.5 rep squat" or
//     "Curl (EZ bar)" would match;
//   - L05 (2023) lies outside every stats window, so stats never see two casings of one exercise.

export interface Step {
  id: string;
  method: "GET" | "POST" | "PUT" | "PATCH" | "DELETE";
  path: string;
  body?: unknown;
  rawBody?: string;
  save?: { name: string; from: string };
  expect: number | null;
  allow?: { rule: "D1a" | "D1c"; status: number; error?: string };
}

/** Well-formed ObjectId that matches no document; saved as `unknown` before the first step. */
export const UNKNOWN_ID = "bbbbbbbbbbbbbbbbbbbbbbbb";

/** Saves an id under `name`, and its uppercase hex form under `${name}Upper`. */
export function rememberId(saved: Record<string, string>, name: string, id: string) {
  saved[name] = id;
  saved[`${name}Upper`] = id.toUpperCase();
}

/** The fixed "today" every stats step passes */
export const TODAY = "2026-03-18";

export function buildScenario(): Step[] {
  const RAW = "{";
  const BAD = "abc"; // malformed id
  // 12 characters: Mongoose documents isValidObjectId as accepting any 12-character string; today's
  // version rejects it (L06 shows it dropped like any malformed workoutId)
  const TWELVE = "parity-12chr";

  const d1a = (error: string) => ({ rule: "D1a" as const, status: 404, error });
  const d1c = () => ({ rule: "D1c" as const, status: 400, error: "Validation failed" });

  const get = (id: string, path: string, expect: number | null, extra: Partial<Step> = {}): Step => ({ id, method: "GET", path, expect, ...extra });
  const send = (id: string, method: Step["method"], path: string, body: unknown, expect: number | null, extra: Partial<Step> = {}): Step => ({
    id,
    method,
    path,
    body,
    expect,
    ...extra,
  });
  const raw = (id: string, method: Step["method"], path: string, expect: number | null, extra: Partial<Step> = {}): Step => ({
    id,
    method,
    path,
    rawBody: RAW,
    expect,
    ...extra,
  });
  const del = (id: string, path: string, expect: number | null, extra: Partial<Step> = {}): Step => ({ id, method: "DELETE", path, expect, ...extra });
  const save = (name: string) => ({ save: { name, from: "_id" } });
  const names = (...list: string[]) => list.map((n) => `name=${encodeURIComponent(n)}`).join("&");
  const set = (reps: number, weight: number, done?: boolean) => (done === undefined ? { reps, weight } : { reps, weight, done });

  const W = "/api/figure/workouts";
  const L = "/api/figure/workout-logs";
  const R = "/api/figure/runs";
  const X = "/api/figure/exercises";
  const S = `/api/figure/stats?today=${TODAY}`;
  const RC = "/api/figure/recipes";
  const SH = "/api/figure/shopping-items";

  return [
    // ── Workouts ──
    // Name and notes trimmed by the schema (exercise notes too); a client `order` is stripped and the
    // order is assigned (max + 1, from 0)
    send(
      "W01",
      "POST",
      W,
      {
        name: "  Push Day  ",
        notes: "  chest focus  ",
        order: 42,
        exercises: [
          { name: " bench press ", targetSets: 3, targetReps: 8, targetWeight: 135, notes: "  pause  " },
          { name: "Overhead Press", targetSets: 3, targetReps: 10 },
        ],
      },
      201,
      save("w1"),
    ),
    // No notes, no exercises: exercises default to []
    send("W02", "POST", W, { name: "Leg Day" }, 201, save("w2")),
    send("W03", "POST", W, { name: "Pull Day", exercises: [{ name: "Lat Pulldown", targetSets: 3, targetReps: 12, targetWeight: 90 }] }, 201, save("w3")),
    send("W04", "POST", W, { name: "", notes: 5, exercises: [{ name: "", targetSets: 0, targetReps: -1, targetWeight: -5 }] }, 400),
    raw("W05", "POST", W, 500, { allow: d1c() }),
    get("W06", `${W}/{w1}`, 200),
    get("W07", `${W}/{unknown}`, 404),
    get("W08", `${W}/${BAD}`, 404),
    // current behavior: an uppercase hex id finds the workout (D1a: the converted code answers 404)
    get("W09", `${W}/{w1Upper}`, 200, { allow: d1a("Workout not found") }),
    send(
      "W10",
      "PUT",
      `${W}/{w2}`,
      {
        name: "Leg Day",
        notes: "  quads  ",
        exercises: [
          { name: "1.5 rep squat", targetSets: 4, targetReps: 6, targetWeight: 95 },
          { name: "Curl (EZ bar)", targetSets: 3, targetReps: 12, targetWeight: 40, notes: "  slow  " },
        ],
      },
      200,
    ),
    // notes omitted: kept. The exercise list is replaced, so the omitted targetWeight is gone
    send(
      "W11",
      "PUT",
      `${W}/{w1}`,
      { name: "Push Day", exercises: [{ name: "bench press", targetSets: 3, targetReps: 8 }, { name: "Overhead Press", targetSets: 3, targetReps: 10 }] },
      200,
    ),
    // current behavior: exercises omitted → Zod's default [] replaces the list
    send("W12", "PUT", `${W}/{w3}`, { name: " Pull Day v2 " }, 200),
    del("W13", `${W}/{w3}`, 200),
    // The deleted workout held the highest order (2): the next one takes 2 again
    send("W14", "POST", W, { name: "Core" }, 201, save("w4")),
    get("W15", W, 200),

    // ── Workout logs: create ──
    // Valid workoutId; a set without `done` defaults to false; notes trimmed by the schema
    send(
      "L01",
      "POST",
      L,
      {
        date: "2026-03-18",
        workoutId: "{w1}",
        name: "  Push Day  ",
        notes: "  felt strong  ",
        exercises: [
          { name: " Bench Press ", sets: [set(8, 135, true), set(8, 135, true), set(6, 135)] },
          { name: "Overhead Press", sets: [set(10, 65, true), set(10, 65, true)] },
        ],
      },
      201,
      save("l1"),
    ),
    // Unknown but well-formed workoutId: kept
    send(
      "L02",
      "POST",
      L,
      {
        date: "2026-03-17",
        workoutId: "{unknown}",
        name: "Leg Day",
        notes: "legs",
        exercises: [
          { name: "1.5 rep squat", sets: [set(6, 95, true), set(6, 105, true)] },
          { name: "Curl (EZ bar)", sets: [set(12, 40, true)] },
        ],
      },
      201,
      save("l2"),
    ),
    // Malformed workoutId: dropped
    send(
      "L03",
      "POST",
      L,
      {
        date: "2026-03-10",
        workoutId: BAD,
        name: "Push Day",
        exercises: [
          { name: "Bench Press", sets: [set(8, 130, true), set(8, 130, true), set(8, 130, true)] },
          { name: "1x5 rep squat", sets: [set(5, 100, true)] },
        ],
      },
      201,
      save("l3"),
    ),
    // No workoutId; an exercise with no sets
    send(
      "L04",
      "POST",
      L,
      {
        date: "2026-02-25",
        name: "Pull Day",
        exercises: [{ name: "Deadlift", sets: [set(5, 225, true)] }, { name: "Curl EZ bar", sets: [set(10, 35, true)] }, { name: "Plank" }],
      },
      201,
      save("l4"),
    ),
    // An uppercase hex workoutId is stored lowercased (by Mongoose today)
    send(
      "L05",
      "POST",
      L,
      { date: "2023-06-01", workoutId: "{w2Upper}", name: "Old Pull", exercises: [{ name: "DEADLIFT", sets: [set(3, 200, true)] }, { name: "Bench Press", sets: [set(5, 100, true)] }] },
      201,
      save("l5"),
    ),
    // Same day as L01, created later. A 12-character workoutId is dropped
    send(
      "L06",
      "POST",
      L,
      { date: "2026-03-18", workoutId: TWELVE, name: "Evening Press", exercises: [{ name: "Overhead Press", sets: [set(8, 70, true), set(8, 70, false)] }] },
      201,
      save("l6"),
    ),
    // After the stats `today`: outside every stats window, but an active day for the streak
    send("L07", "POST", L, { date: "2026-03-20", name: "Max Day", exercises: [{ name: "Bench Press", sets: [set(1, 200, true)] }] }, 201, save("l7")),
    send("L08", "POST", L, { date: "2026-3-18", name: "", exercises: [{ name: "x", sets: [{ reps: -1, weight: 5 }] }] }, 400),

    // ── Workout logs: read ──
    get("L09", `${L}?date=2026-03-18`, 200),
    get("L10", `${L}?startDate=2026-03-01&endDate=2026-03-17`, 200),
    get("L11", `${L}?limit=2`, 200),
    // limit 0 and junk fall back to 50; 500 is capped at 200
    get("L12", `${L}?limit=0`, 200),
    get("L13", `${L}?limit=500`, 200),
    get("L14", `${L}?limit=junk`, 200),
    // A malformed date is ignored and the range applies
    get("L15", `${L}?date=2026-3-18&startDate=2026-02-01&endDate=2026-02-28`, 200),
    get("L16", `${L}/{l2}`, 200),

    // ── Runs ──
    // type defaults to "easy"; notes trimmed by the schema
    send("R01", "POST", R, { date: "2026-03-16", distance: 3.1, durationSeconds: 1800, notes: "  park loop  " }, 201, save("r1")),
    send("R02", "POST", R, { date: "2026-03-15", distance: 6.2, durationSeconds: 3300, type: "long" }, 201, save("r2")),
    send("R03", "POST", R, { date: "2026-01-05", distance: 4, durationSeconds: 1920, type: "tempo" }, 201, save("r3")),
    send("R04", "POST", R, { date: "2026-03-18", distance: 2.5, durationSeconds: 1000, type: "intervals" }, 201, save("r4")),
    send("R05", "POST", R, { date: "2026-03-14", distance: 0, durationSeconds: 600, type: "sprint" }, 400),
    // Range and limit: the newest run from 2026-03-01 to 2026-03-16
    get("R06", `${R}?startDate=2026-03-01&endDate=2026-03-16&limit=1`, 200),
    // limit junk falls back to 100; a malformed startDate is ignored: every run
    get("R07", `${R}?limit=junk&startDate=2026-3-1`, 200),
    // notes with surrounding spaces: set and trimmed
    send("R08", "PUT", `${R}/{r1}`, { date: "2026-03-16", distance: 3.2, durationSeconds: 1790, notes: "  new route  " }, 200),
    // notes omitted: removed; type omitted: back to "easy"
    send("R09", "PUT", `${R}/{r2}`, { date: "2026-03-15", distance: 6.2, durationSeconds: 3300 }, 200),
    send("R10", "PUT", `${R}/{unknown}`, { date: "2026-03-15", distance: 1, durationSeconds: 300 }, 404),
    del("R11", `${R}/{r3}`, 200),
    del("R12", `${R}/${BAD}`, 404),

    // ── Exercises ──
    // Workout spellings come first ("bench press" from W1 wins over the logs' "Bench Press").
    // not guaranteed: among the logs, "DEADLIFT" wins over "Deadlift" because distinct reads the
    // exercises.name index in byte order; workouts have no such index
    get("X01", `${X}/names`, 200),
    get("X02", `${X}/progress`, 200),
    // Surrounding spaces and another case; L05 (2023) included; the undone set in L01 is left out
    get("X03", `${X}/progress?${names("  BENCH press  ")}`, 200),
    // Regex metacharacters are literal: the decoys "Curl EZ bar" and "1x5 rep squat" do not match
    get("X04", `${X}/progress?${names("Curl (EZ bar)")}`, 200),
    // A malformed startDate is ignored
    get("X05", `${X}/progress?${names("1.5 rep squat")}&startDate=2026-3-1`, 200),
    // startDate filters (inclusive of that day): L01 and L07 only
    get("X06", `${X}/progress?${names("Bench Press")}&startDate=2026-03-18`, 200),
    get("X07", `${X}/history`, 200),
    // Newest first: Bench Press from L07 (future day), Overhead Press from L06 (same day as L01, later)
    get("X08", `${X}/history?${names("Bench Press", "Overhead Press", "1.5 rep squat", "Nope")}`, 200),
    // before is inclusive (L03 on 2026-03-10); "Deadlift" (L04) is newer than "DEADLIFT" (L05);
    // surrounding spaces trimmed; metacharacters literal: L04's "Curl EZ bar" and L03's "1x5 rep squat"
    // do not match, so those two names are absent
    get("X09", `${X}/history?${names("bench press", "  Deadlift  ", "Curl (EZ bar)", "1.5 rep squat")}&before=2026-03-10`, 200),
    // excludeLogId skips that log: the next newest match wins
    get("X10", `${X}/history?${names("Overhead Press", "Bench Press")}&excludeLogId={l6}&before=2026-03-18`, 200),
    // Duplicate names (same and other case): one entry under the lowercased key
    get("X11", `${X}/history?${names("BENCH PRESS", "bench press", "BENCH PRESS")}&before=2026-03-12`, 200),

    // ── Stats (today fixed) ──
    // weeks 1 → 2, 500 → 104, junk → 12
    get("S01", `${S}&weeks=1`, 200),
    get("S02", `${S}&weeks=12`, 200),
    get("S03", `${S}&weeks=500`, 200),
    get("S04", `${S}&weeks=junk`, 200),

    // ── Workout logs: update and delete ──
    // workoutId and notes omitted: workoutId removed. current behavior: notes kept
    send("L17", "PUT", `${L}/{l2}`, { date: "2026-03-17", name: "Leg Day", exercises: [{ name: "1.5 rep squat", sets: [set(6, 100, true)] }] }, 200),
    // A valid workoutId on update is set; exercises omitted → []
    send("L18", "PUT", `${L}/{l3}`, { date: "2026-03-11", workoutId: "{w1}", name: "  Push Day  ", notes: "  moved  " }, 200),
    send("L19", "PUT", `${L}/{unknown}`, { date: "2026-03-11", name: "x" }, 404),
    raw("L20", "PUT", `${L}/{l3}`, 500, { allow: d1c() }),
    del("L21", `${L}/{l6}`, 200),
    del("L22", `${L}/${BAD}`, 404),

    // ── Recipes ──
    // Names are sorted by byte: "Banana Oats", "Onion Soup", "Zucchini Bread", "apple crumble"; tags trimmed
    send(
      "C01",
      "POST",
      RC,
      {
        name: "  Zucchini Bread  ",
        servings: 2,
        ingredients: [{ name: "Zucchini", quantity: 2 }, { name: " Flour ", quantity: 2, unit: " cups " }],
        instructions: "Bake.",
        tags: ["baking", " quick "],
      },
      201,
      save("rz"),
    ),
    // No servings, instructions or tags: defaults
    send("C02", "POST", RC, { name: "apple crumble", ingredients: [{ name: "Apple", quantity: 4 }] }, 201, save("ra")),
    send(
      "C03",
      "POST",
      RC,
      {
        name: "Banana Oats",
        servings: 1,
        tags: ["breakfast"],
        ingredients: [
          { name: "Oats", quantity: 1, unit: "cup" },
          { name: "Milk", quantity: 1, unit: "cup" },
          { name: "Banana" },
          { name: "Salt (kosher)", quantity: 1, unit: "pinch" },
        ],
      },
      201,
      save("rb"),
    ),
    // Two ingredients that merge into each other, and a name stored in two casings on the list
    send(
      "C04",
      "POST",
      RC,
      { name: "Onion Soup", ingredients: [{ name: "ONION", quantity: 3 }, { name: "Onion", unit: "  " }, { name: "Shallot" }, { name: "shallot", quantity: 2 }] },
      201,
      save("ro"),
    ),
    send("C05", "POST", RC, { name: " ", servings: 0, ingredients: [{ name: "", quantity: -1 }], tags: [""] }, 400),
    get("C06", RC, 200),
    get("C07", `${RC}?tag=quick`, 200),
    get("C08", `${RC}/{rz}`, 200),
    get("C09", `${RC}/${BAD}`, 404),
    send("C10", "PUT", `${RC}/{ra}`, { name: "apple crumble", servings: 6, ingredients: [{ name: "Apple", quantity: 5 }], instructions: "Bake 40 min.", tags: ["baking"] }, 200),
    // servings omitted: removed; instructions and tags omitted: back to "" and []
    send("C11", "PUT", `${RC}/{rz}`, { name: "Zucchini Bread", ingredients: [{ name: "Zucchini", quantity: 3 }, { name: "Flour", quantity: 2, unit: "cups" }] }, 200),
    send("C12", "PUT", `${RC}/{unknown}`, { name: "x" }, 404),

    // ── Shopping list ──
    // Checked on create: add-to-list must not merge into it (A01)
    send("H01", "POST", SH, { name: "  Milk  ", quantity: 1, unit: "cup", checked: true }, 201, save("iMilk")),
    send("H02", "POST", SH, { name: "Eggs", quantity: 12 }, 201, save("iEggs")),
    // unit "" is stored as ""
    send("H03", "POST", SH, { name: "Onion", unit: "" }, 201, save("iOnion")),
    send("H04", "POST", SH, { name: "onion", quantity: 1 }, 201, save("iOnion2")),
    send("H05", "POST", SH, { name: "Oats", quantity: 2, unit: "CUP" }, 201, save("iOats")),
    send("H06", "POST", SH, { name: "salt (Kosher)", unit: "Pinch" }, 201, save("iSalt")),
    // Partial updates: checked alone, then name alone on the checked item. current behavior: the
    // partial schema keeps `checked`'s default, so a name-only update unchecks the item
    send("H07", "PUT", `${SH}/{iEggs}`, { checked: true }, 200),
    send("H08", "PUT", `${SH}/{iEggs}`, { name: "  eggs  " }, 200),
    send("H09", "PUT", `${SH}/{iEggs}`, { quantity: -2 }, 400),
    send("H10", "PUT", `${SH}/{unknown}`, { checked: true }, 404),
    raw("H11", "PUT", `${SH}/{iEggs}`, 500, { allow: d1c() }),
    // Unchecked by order, then checked
    get("H12", SH, 200),

    // ── Add to list ──
    // Oats/cup merges into Oats/CUP (2 + 1); Milk is not merged into the checked "Milk" (new item);
    // Banana has no quantity (new item without one); Salt (kosher)/pinch merges into salt (Kosher)/Pinch,
    // which had no quantity (0 + 1)
    send("A01", "POST", `${RC}/{rb}/add-to-list`, undefined, 200),
    // ONION (no unit) merges into an unchecked "Onion"/"onion" with no unit: H03 (unit "") or H04 (no
    // unit). not guaranteed: findOne has no sort; today it takes the first inserted (H03). The second
    // "Onion" (unit "  " → "", no quantity) merges into the same item and leaves its quantity alone.
    // Shallot is added, then "shallot" merges into it
    send("A02", "POST", `${RC}/{ro}/add-to-list`, undefined, 200),
    send("A03", "POST", `${RC}/{unknown}/add-to-list`, undefined, 404),
    send("A04", "POST", `${RC}/${BAD}/add-to-list`, undefined, 404),
    // recipeName on items added from a recipe
    get("A05", SH, 200),

    // ── Deletes ──
    del("C13", `${RC}/{rb}`, 200),
    // Items from the deleted recipe stay, with no recipeName
    get("A06", SH, 200),
    del("H13", `${SH}/{iEggs}`, 200),
    del("H14", `${SH}/${BAD}`, 404),
    // Removes the checked "Milk"; then none are left to remove
    send("H15", "POST", `${SH}/clear-checked`, undefined, 200),
    send("H16", "POST", `${SH}/clear-checked`, undefined, 200),
    // The order continues after the last item
    send("H17", "POST", SH, { name: "Lemons", quantity: 3, checked: false }, 201, save("iLemons")),
  ];
}
