// Figure API logic (workouts, workout logs, runs, exercise stats, recipes, shopping list) as
// store-backed handlers, shared by the server and browser data modes.
// Pure: no framework, browser or server imports.
//
// The Mongoose schemas in src/models/figure/ are the source of every default and trim here.
// Zod (src/lib/figure/validators.ts) already applies most of them; what it does not (the trimmed
// `notes` on workouts, workout exercises, logs and runs, a shopping item's `checked: false` when
// add-to-list creates it, `order`) the handlers apply, so both stores hold and return the same JSON.
//
// Nothing filters on a dotted path through an array ("exercises.name"): the browser store refuses
// it. Exercise names are matched in JavaScript, in both stores, with the regular expressions
// today's routes sent to MongoDB, so metacharacters stay literal and matching stays
// case-insensitive and whole-name.

import { escapeRegex, invalid, isId, notFound, ok, type Handler } from "@/lib/data/api";
import type { Sort } from "@/lib/data/query";
import type { BaseDoc, Collection, Store } from "@/lib/data/store";
import { computeExerciseProgress, computeFitnessStats, rangeStart } from "@/lib/figure/stats";
import { fromDay } from "@/lib/figure/format";
import {
  recipeSchema,
  runLogSchema,
  shoppingItemSchema,
  shoppingItemUpdateSchema,
  workoutLogSchema,
  workoutSchema,
} from "@/lib/figure/validators";
import type { Recipe, ShoppingItem } from "@/types/figure/diet";
import type { RunLog, Workout, WorkoutLog } from "@/types/figure/fitness";

// A shopping item's unit may be null in data written outside the API (MongoDB's "no unit" matched it).
export type ShoppingItemDoc = Omit<ShoppingItem, "recipeName" | "unit"> & { unit?: string | null };

export const workouts = (store: Store): Collection<Workout> => store.collection<Workout>("workouts");
export const workoutLogs = (store: Store): Collection<WorkoutLog> => store.collection<WorkoutLog>("workoutLogs");
export const runLogs = (store: Store): Collection<RunLog> => store.collection<RunLog>("runLogs");
export const recipes = (store: Store): Collection<Recipe> => store.collection<Recipe>("recipes");
export const shoppingItems = (store: Store): Collection<ShoppingItemDoc> =>
  store.collection<ShoppingItemDoc>("shoppingItems");

const DAY = /^\d{4}-\d{2}-\d{2}$/;

// Sort orders. Each ends in `_id`: MongoDB leaves rows tied on every other key in no defined order;
// `_id` settles them the same way in both stores (24 hex digits sort like the ObjectId bytes).
const WORKOUT_ORDER: Sort = { order: 1, createdAt: 1, _id: 1 };
const NEWEST_FIRST: Sort = { date: -1, createdAt: -1, _id: -1 };
const RECIPE_ORDER: Sort = { name: 1, _id: 1 };
const SHOPPING_ORDER: Sort = { checked: 1, order: 1, _id: 1 };
// Today's add-to-list `findOne({ checked: false, ... })` had no sort; MongoDB answered it from the
// `{ checked: 1, order: 1 }` index, so the lowest `order` won (checked with explain on MongoDB).
const MERGE_TARGET_ORDER: Sort = { order: 1, createdAt: 1, _id: 1 };

/**
 * A `workoutId` as today's routes kept it: Mongoose's isValidObjectId accepted 24 hex digits in either
 * case (and, in the version in use, rejected 12-character strings) and stored the ObjectId lowercase.
 * Anything else is dropped (create) or unset (update).
 */
export function keptWorkoutId(value: string | undefined): string | undefined {
  return value && /^[0-9a-f]{24}$/i.test(value) ? value.toLowerCase() : undefined;
}

/** Sets an optional text field trimmed (the schema's `trim`), leaving it out when absent. */
function withTrimmed<T extends Record<string, unknown>>(data: T, key: string): T {
  const value = data[key];
  return (typeof value === "string" ? { ...data, [key]: value.trim() } : data) as T;
}

/**
 * A full-document update that removes `notes` when the body leaves it out or it trims to "", as the
 * run and recipe updates do for their optional fields. The forms send no `notes` when the field is
 * emptied, so emptying it in the UI clears it.
 */
function replacingNotes(fields: Record<string, unknown>): { $set: Record<string, unknown>; $unset?: Record<string, 1> } {
  const { notes, ...rest } = fields;
  return typeof notes === "string" && notes !== "" ? { $set: { ...rest, notes } } : { $set: rest, $unset: { notes: 1 } };
}

/** Drops undefined values, as a JSON body or Mongoose's $set would. */
function defined(data: Record<string, unknown>): Record<string, unknown> {
  return Object.fromEntries(Object.entries(data).filter(([, v]) => v !== undefined));
}

/**
 * A list `limit`: the number, or `fallback` when it is 0 or not a number, clamped to [1, max].
 * MongoDB truncated a fractional limit (2.5 lists 2); the browser store accepts integers only.
 */
export function listLimit(raw: string | null, fallback: number, max: number): number {
  return Math.trunc(Math.min(Math.max(Number(raw) || fallback, 1), max));
}

/** The next `order`: one past the highest, from 0. */
async function nextOrder<T extends BaseDoc & { order?: number }>(collection: Collection<T>): Promise<number> {
  const last = await collection.findOne({}, { sort: { order: -1 } });
  return (last?.order ?? -1) + 1;
}

// ── Workouts ──

function workoutFields(data: ReturnType<typeof workoutSchema.parse>): Record<string, unknown> {
  return defined({
    ...withTrimmed(data, "notes"),
    exercises: data.exercises.map((e) => withTrimmed(defined(e), "notes")),
  });
}

export const listWorkouts: Handler = async ({ store }) =>
  ok(await workouts(store).find({}, { sort: WORKOUT_ORDER }));

export const createWorkout: Handler = async ({ store, body }) => {
  const parsed = workoutSchema.safeParse(body);
  if (!parsed.success) return invalid(parsed.error);
  const doc = { ...workoutFields(parsed.data), order: await nextOrder(workouts(store)) };
  return ok(await workouts(store).insert(doc as Omit<Workout, "_id" | "createdAt" | "updatedAt">), 201);
};

export const getWorkout: Handler = async ({ store, params }) => {
  const workout = await workouts(store).findById(params.workoutId);
  return workout ? ok(workout) : notFound("Workout");
};

// Edits the definition only; past logs keep their snapshot. Omitted, empty or blank notes are removed;
// the exercise list is replaced whole, so an exercise's omitted notes or targetWeight are gone too.
export const updateWorkout: Handler = async ({ store, params, body }) => {
  if (!isId(params.workoutId)) return notFound("Workout");
  const parsed = workoutSchema.safeParse(body);
  if (!parsed.success) return invalid(parsed.error);
  const updated = await workouts(store).updateById(params.workoutId, replacingNotes(workoutFields(parsed.data)));
  return updated ? ok(updated) : notFound("Workout");
};

// Logs made from it are kept.
export const deleteWorkout: Handler = async ({ store, params }) => {
  const deleted = await workouts(store).deleteById(params.workoutId);
  return deleted ? ok({ message: "Workout deleted" }) : notFound("Workout");
};

// ── Workout logs ──

export const listWorkoutLogs: Handler = async ({ store, query }) => {
  const date = query.get("date");
  const startDate = query.get("startDate");
  const endDate = query.get("endDate");
  const limit = listLimit(query.get("limit"), 50, 200);

  const filter: Record<string, unknown> = {};
  if (date && DAY.test(date)) {
    filter.date = date;
  } else {
    const range: Record<string, string> = {};
    if (startDate && DAY.test(startDate)) range.$gte = startDate;
    if (endDate && DAY.test(endDate)) range.$lte = endDate;
    if (Object.keys(range).length) filter.date = range;
  }
  return ok(await workoutLogs(store).find(filter, { sort: NEWEST_FIRST, limit }));
};

function logFields(data: ReturnType<typeof workoutLogSchema.parse>): Record<string, unknown> {
  const rest: Record<string, unknown> = { ...data };
  delete rest.workoutId;
  return defined(withTrimmed(rest, "notes"));
}

export const createWorkoutLog: Handler = async ({ store, body }) => {
  const parsed = workoutLogSchema.safeParse(body);
  if (!parsed.success) return invalid(parsed.error);
  const workoutId = keptWorkoutId(parsed.data.workoutId);
  const doc = { ...logFields(parsed.data), ...(workoutId ? { workoutId } : {}) };
  return ok(await workoutLogs(store).insert(doc as Omit<WorkoutLog, "_id" | "createdAt" | "updatedAt">), 201);
};

export const getWorkoutLog: Handler = async ({ store, params }) => {
  const log = await workoutLogs(store).findById(params.logId);
  return log ? ok(log) : notFound("Workout log");
};

// A missing or malformed workoutId is removed, and so are omitted, empty or blank notes.
export const updateWorkoutLog: Handler = async ({ store, params, body }) => {
  if (!isId(params.logId)) return notFound("Workout log");
  const parsed = workoutLogSchema.safeParse(body);
  if (!parsed.success) return invalid(parsed.error);
  const workoutId = keptWorkoutId(parsed.data.workoutId);
  const { $set, $unset } = replacingNotes(logFields(parsed.data));
  const update = workoutId
    ? { $set: { ...$set, workoutId }, ...($unset ? { $unset } : {}) }
    : { $set, $unset: { ...$unset, workoutId: 1 } };
  const updated = await workoutLogs(store).updateById(params.logId, update);
  return updated ? ok(updated) : notFound("Workout log");
};

export const deleteWorkoutLog: Handler = async ({ store, params }) => {
  const deleted = await workoutLogs(store).deleteById(params.logId);
  return deleted ? ok({ message: "Workout log deleted" }) : notFound("Workout log");
};

// ── Runs ──

export const listRuns: Handler = async ({ store, query }) => {
  const startDate = query.get("startDate");
  const endDate = query.get("endDate");
  const limit = listLimit(query.get("limit"), 100, 500);
  const range: Record<string, string> = {};
  if (startDate && DAY.test(startDate)) range.$gte = startDate;
  if (endDate && DAY.test(endDate)) range.$lte = endDate;
  const filter = Object.keys(range).length ? { date: range } : {};
  return ok(await runLogs(store).find(filter, { sort: NEWEST_FIRST, limit }));
};

export const createRun: Handler = async ({ store, body }) => {
  const parsed = runLogSchema.safeParse(body);
  if (!parsed.success) return invalid(parsed.error);
  const doc = defined(withTrimmed(parsed.data, "notes"));
  return ok(await runLogs(store).insert(doc as Omit<RunLog, "_id" | "createdAt" | "updatedAt">), 201);
};

// Empty or omitted notes are removed; an omitted type is back to "easy" (Zod's default).
export const updateRun: Handler = async ({ store, params, body }) => {
  if (!isId(params.runId)) return notFound("Run");
  const parsed = runLogSchema.safeParse(body);
  if (!parsed.success) return invalid(parsed.error);
  const { notes, ...rest } = parsed.data;
  const update = notes
    ? { $set: { ...defined(rest), notes: notes.trim() } }
    : { $set: defined(rest), $unset: { notes: 1 } };
  const updated = await runLogs(store).updateById(params.runId, update);
  return updated ? ok(updated) : notFound("Run");
};

export const deleteRun: Handler = async ({ store, params }) => {
  const deleted = await runLogs(store).deleteById(params.runId);
  return deleted ? ok({ message: "Run deleted" }) : notFound("Run");
};

// ── Exercises ──

/** Today's MongoDB filter `^name$` (case-insensitive), as a JavaScript test. */
const wholeName = (name: string): RegExp => new RegExp(`^${escapeRegex(name)}$`, "i");
/** Today's progress filter: the whole name, case-insensitive, surrounding whitespace allowed. */
const paddedName = (name: string): RegExp => new RegExp(`^\\s*${escapeRegex(name)}\\s*$`, "i");

const hasExercise = (log: WorkoutLog, tests: RegExp[]): boolean =>
  (log.exercises ?? []).some((e) => typeof e.name === "string" && tests.some((t) => t.test(e.name)));

/** Compares strings by code point, which is UTF-8 byte order: how MongoDB compares them without a collation. */
export function byteOrder(a: string, b: string): number {
  const x = [...a];
  const y = [...b];
  for (let i = 0; i < Math.min(x.length, y.length); i++) {
    const d = (x[i].codePointAt(0) ?? 0) - (y[i].codePointAt(0) ?? 0);
    if (d !== 0) return d;
  }
  return x.length - y.length;
}

/** Each distinct exercise name in `docs`, in byte order, as MongoDB's `distinct("exercises.name")` lists them. */
function distinctNames(docs: { exercises?: { name?: unknown }[] }[]): string[] {
  const set = new Set<string>();
  for (const doc of docs) for (const e of doc.exercises ?? []) if (typeof e.name === "string") set.add(e.name);
  return [...set].sort(byteOrder);
}

/**
 * GET /api/figure/exercises/names — every exercise name used so far, for autocomplete.
 *
 * Rule for which spelling wins when one name is stored in several casings: workouts' names come
 * before logs' names (today's code concatenates them in that order), and within each source the
 * distinct names are in byte order. That is MongoDB's order: `distinct` returns its values sorted
 * (it reads the logs' `exercises.name` index in key order and, for workouts, which have no index,
 * still answers sorted; checked on MongoDB on 2026-11-17), so "DEADLIFT" beats "Deadlift" and "B"
 * beats "b". The first spelling per lowercased name is kept, then the list is sorted with
 * localeCompare as today.
 */
export const listExerciseNames: Handler = async ({ store }) => {
  const [fromWorkouts, fromLogs] = await Promise.all([workouts(store).find(), workoutLogs(store).find()]);
  const byKey = new Map<string, string>();
  for (const n of [...distinctNames(fromWorkouts), ...distinctNames(fromLogs)]) {
    const key = n.toLowerCase();
    if (!byKey.has(key)) byKey.set(key, n);
  }
  return ok([...byKey.values()].sort((a, b) => a.localeCompare(b)));
};

// GET /api/figure/exercises/progress?name=Bench&startDate=yyyy-MM-dd → one point per session
export const exerciseProgress: Handler = async ({ store, query }) => {
  const name = query.get("name")?.trim();
  if (!name) return ok([]);
  const startDate = query.get("startDate");
  const filter = startDate && DAY.test(startDate) ? { date: { $gte: startDate } } : {};
  // Today sorted by date only; logs on one day were in no defined order. Pinned: oldest first.
  const logs = await workoutLogs(store).find(filter, { sort: { date: 1, createdAt: 1, _id: 1 } });
  const test = paddedName(name);
  return ok(computeExerciseProgress(logs.filter((log) => hasExercise(log, [test])), name));
};

/** How many of the newest matching logs history reads. */
export const HISTORY_WINDOW = 200;

/**
 * GET /api/figure/exercises/history?name=Bench&name=Squat[&before=yyyy-MM-dd][&excludeLogId=]
 * → { [lowercased name]: { name, date, sets } }, the most recent logged sets for each exercise.
 *
 * As today's aggregation: the newest 200 logs (date desc, createdAt desc) holding any of the names
 * are the window; `excludeLogId` (exact string equality) is skipped after the window is taken, so
 * it still counts toward the 200; within a log, exercises in their stored order; the first hit per
 * lowercased name wins. Logs tied on date and createdAt were in no defined order; `_id` descending
 * settles them (it cannot change an answer today's code gave deterministically).
 */
export const exerciseHistory: Handler = async ({ store, query }) => {
  const names = [...new Set(query.getAll("name").map((n) => n.trim()).filter(Boolean))].slice(0, 50);
  const before = query.get("before");
  const excludeLogId = query.get("excludeLogId");
  if (names.length === 0) return ok({});

  const filter = before && DAY.test(before) ? { date: { $lte: before } } : {};
  const tests = names.map(wholeName);
  const logs = (await workoutLogs(store).find(filter, { sort: NEWEST_FIRST }))
    .filter((log) => hasExercise(log, tests))
    .slice(0, HISTORY_WINDOW);

  const result: Record<string, { name: string; date: string; sets: unknown[] }> = {};
  for (const log of logs) {
    if (excludeLogId && log._id === excludeLogId) continue;
    for (const e of log.exercises) {
      if (typeof e.name !== "string" || !tests.some((t) => t.test(e.name))) continue;
      const key = e.name.toLowerCase();
      if (!result[key]) result[key] = { name: e.name, date: log.date, sets: e.sets };
    }
  }
  return ok(result);
};

// ── Stats ──

/**
 * GET /api/figure/stats?weeks=12&today=yyyy-MM-dd
 * `today` comes from the browser so weeks line up with the user's local calendar; without it, the
 * request's clock (`now`).
 */
export const fitnessStats: Handler = async ({ store, query, now }) => {
  const weeks = Math.min(Math.max(Math.round(Number(query.get("weeks")) || 12), 2), 104);
  const todayParam = query.get("today");
  const today = todayParam && DAY.test(todayParam) ? fromDay(todayParam) : now;
  const start = rangeStart(today, weeks);

  // Today's queries had no sort; MongoDB answered `{ date: { $gte } }` from the `{ date: -1,
  // createdAt: -1 }` index, so newest first. The order matters: the first casing seen names a top
  // exercise, and paces on one date keep their input order.
  const [logs, runs, logDays, runDays] = await Promise.all([
    workoutLogs(store).find({ date: { $gte: start } }, { sort: NEWEST_FIRST }),
    runLogs(store).find({ date: { $gte: start } }, { sort: NEWEST_FIRST }),
    workoutLogs(store).distinct("date"),
    runLogs(store).distinct("date"),
  ]);
  const activeDays = new Set<string>([...logDays, ...runDays].filter((d): d is string => typeof d === "string"));
  return ok(computeFitnessStats(logs, runs, activeDays, today, weeks));
};

// ── Recipes ──

export const listRecipes: Handler = async ({ store, query }) => {
  const tag = query.get("tag");
  return ok(await recipes(store).find(tag ? { tags: tag } : {}, { sort: RECIPE_ORDER }));
};

const recipeFields = (data: ReturnType<typeof recipeSchema.parse>): Record<string, unknown> =>
  defined({ ...data, ingredients: data.ingredients.map(defined) });

export const createRecipe: Handler = async ({ store, body }) => {
  const parsed = recipeSchema.safeParse(body);
  if (!parsed.success) return invalid(parsed.error);
  const doc = recipeFields(parsed.data);
  return ok(await recipes(store).insert(doc as Omit<Recipe, "_id" | "createdAt" | "updatedAt">), 201);
};

export const getRecipe: Handler = async ({ store, params }) => {
  const recipe = await recipes(store).findById(params.recipeId);
  return recipe ? ok(recipe) : notFound("Recipe");
};

// Omitted servings are removed; omitted instructions and tags are back to "" and [] (Zod's defaults).
export const updateRecipe: Handler = async ({ store, params, body }) => {
  if (!isId(params.recipeId)) return notFound("Recipe");
  const parsed = recipeSchema.safeParse(body);
  if (!parsed.success) return invalid(parsed.error);
  const { servings, ...rest } = recipeFields(parsed.data);
  const update = servings === undefined ? { $set: rest, $unset: { servings: 1 } } : { $set: { ...rest, servings } };
  const updated = await recipes(store).updateById(params.recipeId, update);
  return updated ? ok(updated) : notFound("Recipe");
};

// Shopping items added from it stay on the list.
export const deleteRecipe: Handler = async ({ store, params }) => {
  const deleted = await recipes(store).deleteById(params.recipeId);
  return deleted ? ok({ message: "Recipe deleted" }) : notFound("Recipe");
};

/** No unit, as today's query meant it: missing, "" or null. */
const noUnit = (unit: unknown): boolean => unit === undefined || unit === null || unit === "";

/**
 * POST /api/figure/recipes/:recipeId/add-to-list
 * Adds each ingredient to the shopping list. An unchecked item with the same name and unit
 * (case-insensitive, whole value; no unit matching missing, "" or null) is merged by summing
 * quantities instead of duplicated; an ingredient with no quantity leaves the item's quantity alone.
 * Ingredients are handled in order, so a later one can merge into an item an earlier one added.
 * When several items match, the one with the lowest `order` (then createdAt, then _id) is merged
 * into: today's findOne had no sort and MongoDB read the `{ checked: 1, order: 1 }` index.
 * Each ingredient is a read then a write. In browser data mode the whole handler is one step of the
 * request queue (`localRequest`), so two overlapping calls cannot interleave; on MongoDB two truly
 * concurrent calls still can (known limit).
 */
export const addRecipeToList: Handler = async ({ store, params }) => {
  const recipe = await recipes(store).findById(params.recipeId);
  if (!recipe) return notFound("Recipe");

  const items = shoppingItems(store);
  let order = await nextOrder(items);
  let added = 0;
  let merged = 0;

  for (const ing of recipe.ingredients ?? []) {
    const name = ing.name.trim();
    const unit = ing.unit?.trim() || undefined;
    const nameTest = wholeName(name);
    const unitTest = unit ? wholeName(unit) : null;
    const candidates = await items.find({ checked: false }, { sort: MERGE_TARGET_ORDER });
    const existing = candidates.find(
      (item) =>
        typeof item.name === "string" &&
        nameTest.test(item.name) &&
        (unitTest ? typeof item.unit === "string" && unitTest.test(item.unit) : noUnit(item.unit)),
    );

    if (existing) {
      if (ing.quantity !== undefined && ing.quantity !== null) {
        const quantity = (existing.quantity ?? 0) + ing.quantity;
        // Mongoose saved nothing (updatedAt included) when the value did not change.
        if (quantity !== existing.quantity) await items.updateById(existing._id, { $set: { quantity } });
      }
      merged++;
    } else {
      const doc = defined({ name, quantity: ing.quantity, unit, checked: false, recipeId: recipe._id, order: order++ });
      await items.insert(doc as Omit<ShoppingItemDoc, "_id" | "createdAt" | "updatedAt">);
      added++;
    }
  }
  return ok({ added, merged });
};

// ── Shopping list ──

// Unchecked first, each with its source recipe's name (absent once the recipe is deleted).
export const listShoppingItems: Handler = async ({ store }) => {
  const items = await shoppingItems(store).find({}, { sort: SHOPPING_ORDER });
  const recipeIds = [...new Set(items.filter((i) => i.recipeId).map((i) => String(i.recipeId)))];
  const found = recipeIds.length ? await recipes(store).find({ _id: { $in: recipeIds } }) : [];
  const names = new Map(found.map((r) => [r._id, r.name]));
  return ok(
    items.map((i) => {
      const recipeName = i.recipeId ? names.get(String(i.recipeId)) : undefined;
      return recipeName === undefined ? i : { ...i, recipeName };
    }),
  );
};

export const createShoppingItem: Handler = async ({ store, body }) => {
  const parsed = shoppingItemSchema.safeParse(body);
  if (!parsed.success) return invalid(parsed.error);
  const items = shoppingItems(store);
  const doc = defined({ ...parsed.data, order: await nextOrder(items) });
  return ok(await items.insert(doc as Omit<ShoppingItemDoc, "_id" | "createdAt" | "updatedAt">), 201);
};

/**
 * PUT /api/figure/shopping-items/:itemId — partial update (e.g. { checked: true }). A field absent
 * from the body is left unchanged; `quantity: null` and an empty or blank `unit` remove the field.
 */
export const updateShoppingItem: Handler = async ({ store, params, body }) => {
  if (!isId(params.itemId)) return notFound("Shopping item");
  const parsed = shoppingItemUpdateSchema.safeParse(body);
  if (!parsed.success) return invalid(parsed.error);
  const { quantity, unit, ...rest } = parsed.data;
  const $unset: Record<string, 1> = {};
  if (quantity === null) $unset.quantity = 1;
  if (unit === "") $unset.unit = 1;
  const $set = defined({
    ...rest,
    ...(quantity !== null ? { quantity } : {}),
    ...(unit !== "" ? { unit } : {}),
  });
  const update = Object.keys($unset).length ? { $set, $unset } : { $set };
  const updated = await shoppingItems(store).updateById(params.itemId, update);
  return updated ? ok(updated) : notFound("Shopping item");
};

export const deleteShoppingItem: Handler = async ({ store, params }) => {
  const deleted = await shoppingItems(store).deleteById(params.itemId);
  return deleted ? ok({ message: "Shopping item deleted" }) : notFound("Shopping item");
};

// Removes every checked item.
export const clearCheckedItems: Handler = async ({ store }) =>
  ok({ deleted: await shoppingItems(store).deleteMany({ checked: true }) });
