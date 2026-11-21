import test from "node:test";
import { format } from "date-fns";
import assert from "node:assert/strict";
import { COLLECTIONS, type BaseDoc, type Collection, type CollectionName, type Store } from "@/lib/data/store";
import { BrowserStore } from "@/lib/data/browser-store";
import { memoryStorage } from "@/lib/data/test-helpers";
import { availableModules, modules } from "@/lib/modules";
import type { LinkGroup } from "@/types/links/link-group";
import type { LinkItem } from "@/types/links/link";
import type { Listing, Tour } from "@/types/future/apartments";
import { listingSchema } from "@/lib/future/validators";
import { clearBrowserData, ensureDemoSeed, loadSampleData, SEEDED_KEY } from "./index";
import { futureSample } from "./future";
import { linksSample } from "./links";
import { financeSample } from "./finance";
import { dispatch } from "@/lib/data/dispatch";
import { financeRoutes } from "@/lib/finance/api/routes";
import type { TransactionDoc } from "@/lib/finance/api/docs";
import type { Account } from "@/types/finance/account";
import type { Category } from "@/types/finance/category";
import type { SummaryResult } from "@/types/finance/summary";
import type { ProjectionResult } from "@/types/finance/projection";
import { accountSchema, financeProfileSchema, transactionSchema } from "@/lib/finance/validators";
import { projectsSample } from "./projects";
import { projectSchema, taskSchema } from "@/lib/projects/validators";
import { projectsRoutes } from "@/lib/projects/api/routes";
import type { Project } from "@/types/projects/project";
import type { Task } from "@/types/projects/task";
import type { Scratchpad } from "@/types/projects/scratchpad";
import { TASK_STATUSES } from "@/lib/projects/constants";
import { formatDueDay } from "@/lib/projects/due-date";
import { projectRollup } from "@/lib/dashboard/stats";
import { figureSample } from "./figure";
import { figureRoutes } from "@/lib/figure/api/routes";
import {
  recipeSchema,
  runLogSchema,
  shoppingItemSchema,
  workoutLogSchema,
  workoutSchema,
} from "@/lib/figure/validators";
import type { ExerciseProgressPoint, FitnessStats } from "@/lib/figure/stats";
import type { Recipe, ShoppingItem } from "@/types/figure/diet";
import type { RunLog, Workout, WorkoutLog } from "@/types/figure/fitness";

test("loadSampleData fills groups and links, and running it twice does not duplicate", async () => {
  const store = new BrowserStore(memoryStorage());
  await loadSampleData(store);
  await loadSampleData(store);
  const groups = await store.collection<LinkGroup>("linkGroups").find({}, { sort: { order: 1 } });
  const links = await store.collection<LinkItem>("links").find();
  const sample = linksSample();
  assert.equal(groups.length, sample.groups.length);
  assert.equal(links.length, sample.groups.reduce((n, g) => n + g.links.length, 0));
  assert.deepEqual(groups.map((g) => g.order), groups.map((_, i) => i));
  assert.ok(links.every((l) => groups.some((g) => g._id === l.groupId)));
  assert.ok(links.every((l) => l.url.startsWith("https://")));
});

test("ensureDemoSeed seeds once", async () => {
  const storage = memoryStorage();
  const store = new BrowserStore(storage);
  assert.equal(await ensureDemoSeed(store, storage), true);
  assert.equal(await ensureDemoSeed(store, storage), false);
  await store.collection<LinkGroup>("linkGroups").deleteMany({});
  assert.equal(await ensureDemoSeed(store, storage), false);
});

test("ensureDemoSeed leaves the key unset when loading fails, and a later call seeds", async () => {
  const storage = memoryStorage();
  const store = new BrowserStore(storage);
  storage.failWrites = true;
  await assert.rejects(ensureDemoSeed(store, storage));
  assert.equal(storage.getItem(SEEDED_KEY), null);
  storage.failWrites = false;
  assert.equal(await ensureDemoSeed(store, storage), true);
  assert.equal(storage.getItem(SEEDED_KEY), "1");
  assert.ok((await store.collection<LinkGroup>("linkGroups").find()).length > 0);
});

test("clearBrowserData empties every collection and the demo stays empty after a reload", async () => {
  const storage = memoryStorage();
  const store = new BrowserStore(storage);
  assert.equal(await ensureDemoSeed(store, storage), true);
  clearBrowserData(store, storage);
  for (const name of Object.keys(COLLECTIONS) as CollectionName[]) {
    assert.equal(await store.collection(name).count(), 0, name);
  }
  // A reload builds a new store over the same storage; the demo must not reseed.
  const reloaded = new BrowserStore(storage);
  assert.equal(await ensureDemoSeed(reloaded, storage), false);
  assert.equal(await reloaded.collection("projects").count(), 0);
  assert.equal(await reloaded.collection("accounts").count(), 0);
});

test("clearBrowserData on a store that was never seeded still stops the first-visit seed", async () => {
  const storage = memoryStorage();
  const store = new BrowserStore(storage);
  clearBrowserData(store, storage);
  assert.equal(await ensureDemoSeed(store, storage), false);
  assert.equal(await store.collection("linkGroups").count(), 0);
});

test("loading the sample after clearing restores it in full", async () => {
  const storage = memoryStorage();
  const store = new BrowserStore(storage);
  assert.equal(await ensureDemoSeed(store, storage), true);
  clearBrowserData(store, storage);
  await loadSampleData(store);
  const projectCount = projectsSample().projects.length;
  assert.equal(await store.collection("projects").count(), projectCount);
  assert.equal(await store.collection("tasks").count(), projectsSample().projects.reduce((n, p) => n + p.tasks.length, 0));
  assert.equal(await store.collection("scratchpads").count(), projectsSample().projects.filter((p) => p.notes !== undefined).length);
});

test("every module has browser data: none is hidden in browser mode", () => {
  assert.deepEqual(availableModules("browser").map((m) => m.id), ["finance", "figure", "future", "projects", "links"]);
  assert.equal(availableModules("server").length, modules.length);
});

test("loadSampleData fills the Future module relative to today, and twice does not duplicate", async () => {
  const store = new BrowserStore(memoryStorage());
  const today = new Date(2026, 10, 17);
  await loadSampleData(store, today);
  await loadSampleData(store, today);
  const listings = await store.collection<Listing>("listings").find();
  const tours = await store.collection<Tour>("tours").find({}, { sort: { date: 1 } });
  const sample = futureSample(today);
  assert.equal(listings.length, sample.listings.length);
  assert.equal(tours.length, sample.listings.reduce((n, l) => n + l.tours.length, 0));
  assert.ok(tours.every((t) => listings.some((l) => l._id === t.listingId)));
  assert.ok(tours[0].date < "2026-11-17" && tours[tours.length - 1].date > "2026-11-17");
  assert.ok(listings.every((l) => l.rent >= 140000 && l.rent <= 320000));
  assert.ok(listings.some((l) => l.status === "rejected") && listings.some((l) => l.status === "toured"));
  assert.equal(await store.collection("futureSettings").count(), 1);
  assert.ok(new Set(listings.map((l) => l.city)).size === 3);
});

test("sample listings pass the module's own validation", () => {
  for (const { tours, ...data } of futureSample(new Date(2026, 10, 17)).listings) {
    assert.equal(listingSchema.safeParse(data).success, true, data.name);
    assert.ok(Array.isArray(tours));
  }
});

test("ensureDemoSeed claims the seeded key before loading, so a concurrent tab does not seed twice", async () => {
  const storage = memoryStorage();
  const real = new BrowserStore(storage);
  let keyDuringLoad: string | null | undefined;
  const store: Store = {
    collection<T extends BaseDoc>(name: CollectionName): Collection<T> {
      const collection = real.collection<T>(name);
      const deleteMany = collection.deleteMany.bind(collection);
      collection.deleteMany = (filter) => {
        keyDuringLoad ??= storage.getItem(SEEDED_KEY);
        return deleteMany(filter);
      };
      return collection;
    },
  };
  assert.equal(await ensureDemoSeed(store, storage), true);
  assert.equal(keyDuringLoad, "1");
  assert.equal(await ensureDemoSeed(store, storage), false);
});

const SAMPLE_BALANCES = {
  Cash: 0, "Everyday Checking": 263450, "Rainy Day Savings": 1280000, "Rewards Card": 39604, "Auto Loan": 980000 };

test("loadSampleData fills Finance through the real handlers, relative to today, and twice does not duplicate", async () => {
  const store = new BrowserStore(memoryStorage());
  const today = new Date(2026, 10, 17, 10);
  await loadSampleData(store, today);
  assert.equal(await store.collection<Account>("accounts").count({ isCash: true }), 1);
  await loadSampleData(store, today);
  assert.equal(await store.collection<Account>("accounts").count({ isCash: true }), 1);
  const accts = await store.collection<Account>("accounts").find();
  assert.deepEqual(Object.fromEntries(accts.map((a) => [a.name, a.balance])), {
    Cash: 0, "Everyday Checking": 263450, "Rainy Day Savings": 1280000, "Rewards Card": 39604, "Auto Loan": 980000 });
  assert.deepEqual(accts.map((a) => a.type).sort(), ["bank", "bank", "bank", "credit_card", "debt"]);
  const txs = await store.collection<TransactionDoc>("transactions").find({}, { sort: { date: 1 } });
  assert.equal(txs.length, 14);
  const oneOff = txs.filter((x) => !x.isRecurring);
  assert.deepEqual([oneOff.length, oneOff[0].date, oneOff[11].date], [12, "2026-10-21T00:00:00.000Z", "2026-11-25T00:00:00.000Z"]);
  assert.deepEqual(oneOff.filter((x) => !x.balanceApplied).map((x) => x.description), ["Internet bill", "Auto loan payment"]);
  const defaults = (await store.collection<Category>("financeCategories").find()).map((c) => c.name);
  assert.equal(defaults.length, 9);
  assert.ok(txs.every((x) => x.categoryTags.length > 0 && x.categoryTags.every((tag) => defaults.includes(tag))));
  assert.ok(new Set(oneOff.flatMap((x) => x.categoryTags)).size >= 7);
  const [salary, rent] = [txs.find((x) => x.description === "Salary")!, txs.find((x) => x.description === "Rent")!];
  assert.deepEqual([salary.date, rent.date, rent.amount], ["2026-09-22T00:00:00.000Z", "2026-08-01T00:00:00.000Z", 145000]);
  assert.ok(salary.amountSchedule!.length >= 1 && salary.amount > 100000 && salary.amount < 300000); // net pay per paycheck
  assert.equal(await store.collection("financeProfile").count(), 1);
});

test("the sample gives the dashboard, summary and projections something to show", async () => {
  const store = new BrowserStore(memoryStorage());
  const today = new Date(2026, 10, 17, 10);
  await loadSampleData(store, today);
  const get = (url: string) => dispatch(financeRoutes, store, "GET", url, undefined, today);
  const summary = (await get("/api/summary?view=monthly&date=2026-11-17")).body as { data: SummaryResult };
  assert.ok(summary.data.totals.income > 0 && summary.data.totals.expenses > 0 && summary.data.categoryBreakdown.length >= 3);
  const projection = await get("/api/projections?startDate=2026-11-01&endDate=2027-01-31&granularity=weekly");
  assert.equal(projection.status, 200);
  assert.ok((projection.body as { data: ProjectionResult }).data.timeline.length > 10);
  assert.equal(((await get("/api/accounts")).body as Account[]).length, 5);
});

test("sample bodies pass the module's own validation", () => {
  const sample = financeSample(new Date(2026, 10, 17, 10));
  for (const { key, ...data } of sample.accounts) assert.equal(accountSchema.safeParse(data).success, true, key);
  for (const { key, account, toAccount, ...data } of sample.transactions) {
    assert.equal(transactionSchema.safeParse({ ...data, accountId: "a".repeat(24), ...(toAccount ? { toAccountId: "b".repeat(24) } : {}) }).success, true, data.description);
    assert.ok(sample.accounts.some((a) => a.key === account));
  }
  assert.equal(financeProfileSchema.safeParse(sample.profile).success, true);
});

test("the Finance sample has the same balances when loaded late in the evening US-Eastern", async () => {
  // 22:30 on Nov 17 in New York, already Nov 18 in UTC.
  const store = new BrowserStore(memoryStorage());
  const today = new Date("2026-11-18T03:30:00Z");
  await loadSampleData(store, today);
  const accts = await store.collection<Account>("accounts").find();
  assert.deepEqual(Object.fromEntries(accts.map((a) => [a.name, a.balance])), SAMPLE_BALANCES);
  const pending = (await store.collection<TransactionDoc>("transactions").find({ isRecurring: false, balanceApplied: false }))
    .map((x) => x.description).sort();
  assert.deepEqual(pending, ["Auto loan payment", "Internet bill"]);
});

test("loading the Finance sample fails loudly, naming the step, when a handler refuses a request", async () => {
  const storage = memoryStorage();
  const store = new BrowserStore(storage);
  // The store answers, but every write after the first few fails: a handler returns 500.
  let writes = 0;
  const failing: Store = {
    collection<T extends BaseDoc>(name: CollectionName): Collection<T> {
      const collection = store.collection<T>(name);
      if (name === "accounts") {
        const insert = collection.insert.bind(collection);
        collection.insert = (doc) => (++writes > 2 ? Promise.reject(new Error("disk full")) : insert(doc));
      }
      return collection;
    },
  };
  await assert.rejects(loadSampleData(failing, new Date(2026, 10, 17, 10)), (error: Error) => {
    assert.match(error.message, /POST \/api\/accounts/);
    assert.match(error.message, /500/);
    return true;
  });
});

test("loadSampleData fills Projects through the real handlers, relative to today, and twice does not duplicate", async () => {
  const store = new BrowserStore(memoryStorage());
  const today = new Date(2026, 10, 17, 10);
  await loadSampleData(store, today);
  await loadSampleData(store, today);
  const projects = await store.collection<Project>("projects").find();
  const tasks = await store.collection<Task>("tasks").find();
  const pads = await store.collection<Scratchpad>("scratchpads").find();
  const sample = projectsSample();
  assert.equal(projects.length, 3);
  assert.deepEqual(projects.map((p) => p.status).sort(), ["active", "archived", "completed"]);
  assert.equal(tasks.length, sample.projects.reduce((n, p) => n + p.tasks.length, 0));
  assert.ok(tasks.length >= 12 && tasks.length <= 18);
  assert.ok(tasks.every((t) => projects.some((p) => p._id === t.projectId)));
  assert.deepEqual([...new Set(tasks.map((t) => t.status))].sort(), [...TASK_STATUSES].sort());
  assert.equal(new Set(tasks.map((t) => t.priority)).size, 4);
  assert.ok(tasks.every((t) => t.tags.length > 0));
  // Kanban order: 0, 1, 2, ... within each project's column, in sample order.
  for (const project of projects) {
    for (const status of TASK_STATUSES) {
      const column = tasks.filter((t) => t.projectId === project._id && t.status === status).sort((a, b) => a.order - b.order);
      assert.deepEqual(column.map((t) => t.order), column.map((_, i) => i), `${project.name} ${status}`);
    }
  }
  // Due dates are relative to today: some past, some ahead, stored as the app stores a picked date.
  const due = tasks.flatMap((t) => (t.dueDate ? [t.dueDate] : [])).sort();
  assert.ok(due.length >= 8 && due.length < tasks.length);
  assert.ok(due.every((d) => /^\d{4}-\d{2}-\d{2}T00:00:00\.000Z$/.test(d)), due.join());
  assert.ok(due[0] < "2026-11-17" && due[due.length - 1] > "2026-11-18");
  assert.equal(tasks.find((t) => t.title === "Frost date lookup")?.dueDate, "2026-11-18T00:00:00.000Z");
  // …and shown on the intended calendar day (today + 1), whatever the time zone
  assert.equal(formatDueDay(tasks.find((t) => t.title === "Frost date lookup")?.dueDate), "Nov 18");
  assert.equal(pads.length, 1);
  assert.match(pads[0].content, /^# Garden Planner/);
  assert.equal(projects.find((p) => p._id === pads[0].projectId)?.status, "active");
});

test("the Projects sample gives the project list, board and dashboard card something to show", async () => {
  const store = new BrowserStore(memoryStorage());
  const today = new Date(2026, 10, 17, 10);
  await loadSampleData(store, today);
  const get = (url: string) => dispatch(projectsRoutes, store, "GET", url, undefined, today);
  const list = (await get("/api/projects")).body as Project[];
  assert.equal(list.length, 3);
  assert.ok(list.every((p) => p.taskCounts && p.taskCounts.total > 0));
  const rollup = projectRollup(list);
  assert.deepEqual([rollup.active, rollup.completed, rollup.archived], [1, 1, 1]);
  assert.ok(rollup.openTasks > 0 && rollup.doneTasks > 0);
  const active = list.find((p) => p.status === "active")!;
  assert.equal(((await get(`/api/tasks?projectId=${active._id}`)).body as Task[]).length, 8);
  const notes = await get(`/api/projects/${active._id}/scratchpad`);
  assert.equal(notes.status, 200);
  assert.ok((notes.body as Scratchpad).content.length > 0);
});

test("sample projects and tasks pass the module's own validation", () => {
  for (const { tasks, notes, ...data } of projectsSample().projects) {
    assert.equal(projectSchema.safeParse(data).success, true, data.name);
    assert.ok(notes === undefined || notes.length <= 50000);
    for (const { dueInDays, ...task } of tasks) {
      assert.equal(taskSchema.safeParse({ ...task, projectId: "a".repeat(24) }).success, true, task.title);
      assert.ok(dueInDays === undefined || Number.isInteger(dueInDays));
    }
  }
});

test("loading the Projects sample fails loudly, naming the step, when a handler refuses a request", async () => {
  const store = new BrowserStore(memoryStorage());
  let writes = 0;
  const failing: Store = {
    collection<T extends BaseDoc>(name: CollectionName): Collection<T> {
      const collection = store.collection<T>(name);
      if (name === "tasks") {
        const insert = collection.insert.bind(collection);
        collection.insert = (doc) => (++writes > 3 ? Promise.reject(new Error("disk full")) : insert(doc));
      }
      return collection;
    },
  };
  await assert.rejects(loadSampleData(failing, new Date(2026, 10, 17, 10)), (error: Error) => {
    assert.match(error.message, /^Loading the Projects sample failed at POST \/api\/tasks \(Watering log chart\): 500/);
    return true;
  });
});

const FIGURE_TODAY = new Date(2026, 10, 17, 10); // a Tuesday
const figureGet = (store: Store, url: string) => dispatch(figureRoutes, store, "GET", url, undefined, FIGURE_TODAY);

test("loadSampleData fills Figure through the real handlers, relative to today, and twice does not duplicate", async () => {
  const store = new BrowserStore(memoryStorage());
  await loadSampleData(store, FIGURE_TODAY);
  await loadSampleData(store, FIGURE_TODAY);
  const workouts = await store.collection<Workout>("workouts").find({}, { sort: { order: 1 } });
  const logs = await store.collection<WorkoutLog>("workoutLogs").find({}, { sort: { date: 1 } });
  const runs = await store.collection<RunLog>("runLogs").find({}, { sort: { date: 1 } });
  const recipes = await store.collection<Recipe>("recipes").find();
  assert.deepEqual(workouts.map((w) => [w.name, w.order]), [["Push Day", 0], ["Pull Day", 1], ["Leg Day", 2]]);
  assert.ok(workouts.every((w) => w.exercises.length === 4));
  // About 30 logs over the last 12 weeks, each from one of the sample workouts
  assert.equal(logs.length, 30);
  assert.ok(logs[0].date >= "2026-08-25" && logs[logs.length - 1].date === "2026-11-17", `${logs[0].date}..${logs[logs.length - 1].date}`);
  assert.ok(logs.every((l) => workouts.some((w) => w._id === l.workoutId && w.name === l.name)));
  assert.ok(logs.every((l) => l.exercises.every((e) => e.sets.length > 0 && e.sets.every((s) => s.done))));
  const benchNote = logs.find((l) => l.notes === "New best on bench");
  assert.equal(benchNote?.name, "Push Day");
  assert.equal(benchNote?.exercises[0].name, "Bench Press");
  // About 20 runs of mixed types
  assert.equal(runs.length, 20);
  assert.equal(new Set(runs.map((r) => r.type)).size, 6);
  assert.ok(runs[0].date >= "2026-08-25" && runs[runs.length - 1].date === "2026-11-17");
  // 5 recipes, each with tags and ingredients
  assert.equal(recipes.length, 5);
  assert.ok(recipes.every((r) => r.tags.length > 0 && r.ingredients.length > 0 && r.instructions.length > 0));
  // 8-10 shopping items, some checked, some from a recipe
  const items = (await figureGet(store, "/api/figure/shopping-items")).body as ShoppingItem[];
  assert.ok(items.length >= 8 && items.length <= 10, String(items.length));
  assert.deepEqual(items.filter((i) => i.checked).map((i) => i.name).sort(), ["Bananas", "Coffee beans", "Limes"]);
  const fromRecipe = items.filter((i) => i.recipeName === "Chicken Burrito Bowl");
  assert.equal(fromRecipe.length, 5);
  assert.ok(fromRecipe.some((i) => i.checked) && fromRecipe.some((i) => !i.checked));
  assert.ok(items.some((i) => i.recipeId === undefined));
});

test("the Figure sample has a current streak and visible progress on the main lifts", async () => {
  const store = new BrowserStore(memoryStorage());
  await loadSampleData(store, FIGURE_TODAY);
  const stats = (await figureGet(store, "/api/figure/stats?weeks=12&today=2026-11-17")).body as FitnessStats;
  assert.equal(stats.streak.current, 38);
  assert.ok(stats.streak.longest >= 38);
  assert.ok(stats.weeks.every((w) => w.sessions > 0 || w.runs > 0), "every week of the 12 has activity");
  assert.ok(stats.paces.length === 20);
  for (const name of ["Bench Press", "Back Squat", "Deadlift"]) {
    const points = (await figureGet(store, `/api/figure/exercises/progress?name=${encodeURIComponent(name)}`))
      .body as ExerciseProgressPoint[];
    assert.ok(points.length >= 9, name);
    assert.ok(points[points.length - 1].e1rm > points[0].e1rm + 30, `${name}: ${points[0].e1rm} -> ${points[points.length - 1].e1rm}`);
    assert.ok(points.every((p, i) => i === 0 || p.topWeight >= points[i - 1].topWeight), name);
  }
  // Workout definitions carry the latest session's weight
  const history = (await figureGet(store, "/api/figure/exercises/history?name=Bench%20Press")).body as Record<string, { sets: { weight: number }[] }>;
  const push = ((await figureGet(store, "/api/figure/workouts")).body as Workout[])[0];
  assert.equal(push.exercises[0].targetWeight, history["bench press"].sets[0].weight);
  const names = (await figureGet(store, "/api/figure/exercises/names")).body as string[];
  assert.equal(names.length, 12);
});

test("the Figure sample gives the dashboard's Figure card non-zero numbers", async () => {
  // Sunday: "this week" is only today, which has a lift and a run
  for (const today of [FIGURE_TODAY, new Date(2026, 10, 15, 10)]) {
    const store = new BrowserStore(memoryStorage());
    await loadSampleData(store, today);
    const day = format(today, "yyyy-MM-dd");
    const get = (url: string) => dispatch(figureRoutes, store, "GET", url, undefined, today);
    // The card's three reads: useFitnessStats(12), useWorkoutLogs({ limit: 1 }), useShoppingItems()
    const stats = (await get(`/api/figure/stats?weeks=12&today=${day}`)).body as FitnessStats;
    assert.ok(stats.thisWeek.sessions > 0 && stats.lastWeek.sessions > 0, day);
    assert.ok(stats.thisWeek.miles > 0 && stats.lastWeek.miles > 0, day);
    assert.ok(stats.thisWeek.volume > 0 && stats.lastWeek.volume > 0, day);
    assert.ok(stats.streak.current > 0 && stats.streak.longest > 0, day);
    const last = (await get("/api/figure/workout-logs?limit=1")).body as WorkoutLog[];
    assert.deepEqual([last.length, last[0].date], [1, day]);
    const items = (await get("/api/figure/shopping-items")).body as ShoppingItem[];
    assert.ok(items.filter((i) => !i.checked).length > 0);
  }
});

test("every stored Figure document passes its Zod schema", async () => {
  const store = new BrowserStore(memoryStorage());
  await loadSampleData(store, FIGURE_TODAY);
  const check = async (name: CollectionName, schema: { safeParse: (v: unknown) => { success: boolean } }) => {
    const docs = await store.collection(name).find();
    assert.ok(docs.length > 0, name);
    for (const doc of docs) assert.equal(schema.safeParse(doc).success, true, `${name} ${JSON.stringify(doc)}`);
  };
  await check("workouts", workoutSchema);
  await check("workoutLogs", workoutLogSchema);
  await check("runLogs", runLogSchema);
  await check("recipes", recipeSchema);
  await check("shoppingItems", shoppingItemSchema);
  // Sub-documents carry no _id
  for (const w of await store.collection<Workout>("workouts").find()) assert.ok(w.exercises.every((e) => !("_id" in e)));
  for (const l of await store.collection<WorkoutLog>("workoutLogs").find()) assert.ok(l.exercises.every((e) => !("_id" in e)));
});

test("sample Figure bodies pass the module's own validation", () => {
  const sample = figureSample(FIGURE_TODAY);
  for (const { key, ...data } of sample.workouts) assert.equal(workoutSchema.safeParse(data).success, true, key);
  for (const { workout, ...data } of sample.logs) {
    assert.equal(workoutLogSchema.safeParse({ ...data, workoutId: "a".repeat(24) }).success, true, data.date);
    assert.ok(sample.workouts.some((w) => w.key === workout));
  }
  for (const run of sample.runs) assert.equal(runLogSchema.safeParse(run).success, true, run.date);
  for (const recipe of sample.recipes) assert.equal(recipeSchema.safeParse(recipe).success, true, recipe.name);
  for (const item of sample.shopping.items) assert.equal(shoppingItemSchema.safeParse(item).success, true, item.name);
  assert.ok(sample.recipes.some((r) => r.name === sample.shopping.fromRecipe));
});

test("after clearing, loading the sample brings the Figure data back", async () => {
  const storage = memoryStorage();
  const store = new BrowserStore(storage);
  assert.equal(await ensureDemoSeed(store, storage), true);
  assert.equal(await store.collection("workoutLogs").count(), 30);
  clearBrowserData(store, storage);
  for (const name of ["workouts", "workoutLogs", "runLogs", "recipes", "shoppingItems"] as const) {
    assert.equal(await store.collection(name).count(), 0, name);
  }
  await loadSampleData(store);
  assert.equal(await store.collection("workoutLogs").count(), 30);
  assert.equal(await store.collection("runLogs").count(), 20);
});

test("loading the Figure sample fails loudly, naming the step, when a handler refuses a request", async () => {
  const store = new BrowserStore(memoryStorage());
  let writes = 0;
  const failing: Store = {
    collection<T extends BaseDoc>(name: CollectionName): Collection<T> {
      const collection = store.collection<T>(name);
      if (name === "recipes") {
        const insert = collection.insert.bind(collection);
        collection.insert = (doc) => (++writes > 1 ? Promise.reject(new Error("disk full")) : insert(doc));
      }
      return collection;
    },
  };
  await assert.rejects(loadSampleData(failing, FIGURE_TODAY), (error: Error) => {
    assert.match(error.message, /^Loading the Figure sample failed at POST \/api\/figure\/recipes \(Overnight Oats\): 500/);
    return true;
  });
});
