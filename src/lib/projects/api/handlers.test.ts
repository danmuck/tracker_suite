import { test } from "node:test";
import assert from "node:assert/strict";
import type { ApiResult } from "@/lib/data/api";
import { BrowserStore } from "@/lib/data/browser-store";
import { dispatch } from "@/lib/data/dispatch";
import type { BaseDoc, Collection, CollectionName, Store } from "@/lib/data/store";
import { memoryStorage } from "@/lib/data/test-helpers";
import { castDate, castId, type ProjectDoc, type ScratchpadDoc, type TaskDoc } from "./handlers";
import { projectsRoutes } from "./routes";

const START = Date.parse("2026-11-17T15:00:00.000Z");
let tick = START;
let store = new BrowserStore(memoryStorage(), () => new Date(tick++));
const call = (method: string, url: string, body?: unknown): Promise<ApiResult> =>
  dispatch(projectsRoutes, store, method, url, body);

type ProjectRow = ProjectDoc & { taskCounts: { total: number; done: number } };

const UNKNOWN = "b".repeat(24);
const BAD = "abc";

async function project(over: Record<string, unknown> = {}): Promise<ProjectDoc> {
  const res = await call("POST", "/api/projects", { name: "Alpha", ...over });
  assert.equal(res.status, 201, JSON.stringify(res.body));
  return res.body as ProjectDoc;
}

async function task(projectId: string, over: Record<string, unknown> = {}): Promise<TaskDoc> {
  const res = await call("POST", "/api/tasks", { projectId, title: "Task", ...over });
  assert.equal(res.status, 201, JSON.stringify(res.body));
  return res.body as TaskDoc;
}

async function list(projectId: string): Promise<TaskDoc[]> {
  const res = await call("GET", `/api/tasks?projectId=${projectId}`);
  assert.equal(res.status, 200, JSON.stringify(res.body));
  return res.body as TaskDoc[];
}

const board = async (projectId: string) => (await list(projectId)).map((t) => `${t.title}:${t.status}/${t.order}`);

/** Silences the adapter's console.error for the 500 cases. */
function quiet(t: { mock: { method: (o: object, name: string, impl: () => void) => unknown } }) {
  t.mock.method(console, "error", () => {});
}

test.beforeEach(() => {
  tick = START;
  store = new BrowserStore(memoryStorage(), () => new Date(tick++));
});

// ── Projects ──

test("create project: trims, defaults status and color, drops an empty repositoryUrl and unknown keys", async () => {
  const a = await project({ name: "  Alpha  ", description: "  first  ", repositoryUrl: "https://example.com/a", order: 7 });
  assert.deepEqual(
    { ...a, _id: undefined, createdAt: undefined, updatedAt: undefined },
    { _id: undefined, createdAt: undefined, updatedAt: undefined, name: "Alpha", description: "first", repositoryUrl: "https://example.com/a", status: "active", color: "#3b82f6" },
  );
  const b = await project({ name: "Beta", repositoryUrl: "" });
  assert.equal("repositoryUrl" in b, false);
  assert.equal("description" in b, false);
});

test("create project: validation is 400; current behavior: a blank name passes Zod and fails as 500", async (t) => {
  quiet(t);
  const bad = await call("POST", "/api/projects", { name: "", status: "paused", color: "blue", repositoryUrl: "nope" });
  assert.equal(bad.status, 400);
  assert.equal((bad.body as { error: string }).error, "Validation failed");
  assert.deepEqual(await call("POST", "/api/projects", { name: "   " }), { status: 500, body: { error: "Failed to create project" } });
  // Unparseable JSON reaches the handler as no body: 400
  assert.equal((await call("POST", "/api/projects", undefined)).status, 400);
  assert.equal(await store.collection("projects").count(), 0);
});

test("list projects: newest first, ?status= filter (any value, exact), task counts with done", async () => {
  const a = await project({ name: "A" });
  const b = await project({ name: "B", status: "archived" });
  const c = await project({ name: "C" });
  await task(a._id);
  await task(a._id, { status: "done" });
  await task(a._id, { status: "done" });
  await task(b._id, { status: "in_review" });
  await task(UNKNOWN); // current behavior: an orphan, counted in no project
  const rows = (await call("GET", "/api/projects")).body as ProjectRow[];
  assert.deepEqual(rows.map((p) => [p.name, p.taskCounts]), [
    ["C", { total: 0, done: 0 }],
    ["B", { total: 1, done: 0 }],
    ["A", { total: 3, done: 2 }],
  ]);
  const names = async (qs: string) => ((await call("GET", `/api/projects${qs}`)).body as ProjectRow[]).map((p) => p.name);
  assert.deepEqual(await names("?status=archived"), ["B"]);
  assert.deepEqual(await names("?status=active"), ["C", "A"]);
  assert.deepEqual(await names("?status=bogus"), []);
  assert.deepEqual(await names("?status="), ["C", "B", "A"]);
  assert.ok(c);
});

test("get project: found, unknown and malformed ids are 404", async () => {
  const a = await project();
  assert.deepEqual(await call("GET", `/api/projects/${a._id}`), { status: 200, body: a });
  for (const id of [UNKNOWN, BAD]) {
    assert.deepEqual(await call("GET", `/api/projects/${id}`), { status: 404, body: { error: "Project not found" } });
  }
});

test("update project: current behavior: omitted status and color reset, omitted description kept, empty repositoryUrl keeps the URL", async () => {
  const a = await project({ description: "keep", repositoryUrl: "https://example.com/a", color: "#10b981", status: "archived" });
  const res = await call("PUT", `/api/projects/${a._id}`, { name: " Alpha 2 ", repositoryUrl: "" });
  assert.equal(res.status, 200);
  const p = res.body as ProjectDoc;
  assert.deepEqual([p.name, p.description, p.repositoryUrl, p.status, p.color], ["Alpha 2", "keep", "https://example.com/a", "active", "#3b82f6"]);
  assert.notEqual(p.updatedAt, a.updatedAt);
  assert.equal(p.createdAt, a.createdAt);
  // "" clears the description (it is a value, not left out)
  const cleared = (await call("PUT", `/api/projects/${a._id}`, { name: "Alpha", description: "  " })).body as ProjectDoc;
  assert.equal(cleared.description, "");
});

test("update project: lookup before body; validation 400; blank name 500", async (t) => {
  quiet(t);
  const a = await project();
  for (const id of [UNKNOWN, BAD]) {
    assert.deepEqual(await call("PUT", `/api/projects/${id}`, { name: "x" }), { status: 404, body: { error: "Project not found" } });
    // An unknown project with a broken body is still 404
    assert.deepEqual(await call("PUT", `/api/projects/${id}`, undefined), { status: 404, body: { error: "Project not found" } });
  }
  assert.equal((await call("PUT", `/api/projects/${a._id}`, { name: "", color: "#12345" })).status, 400);
  assert.equal((await call("PUT", `/api/projects/${a._id}`, undefined)).status, 400);
  assert.deepEqual(await call("PUT", `/api/projects/${a._id}`, { name: "   " }), { status: 500, body: { error: "Failed to update project" } });
  assert.equal(((await call("GET", `/api/projects/${a._id}`)).body as ProjectDoc).name, "Alpha");
});

test("delete project: removes its tasks and its scratchpad; another project's tasks and scratchpad survive", async () => {
  const a = await project({ name: "A" });
  const b = await project({ name: "B" });
  await task(a._id);
  await task(a._id, { status: "done" });
  const kept = await task(b._id);
  await call("PUT", `/api/projects/${a._id}/scratchpad`, { content: "a notes" });
  await call("PUT", `/api/projects/${b._id}/scratchpad`, { content: "b notes" });

  assert.deepEqual(await call("DELETE", `/api/projects/${a._id}`), { status: 200, body: { message: "Project and associated data deleted" } });

  assert.deepEqual(await list(a._id), []);
  assert.deepEqual((await list(b._id)).map((t) => t._id), [kept._id]);
  const pads = await store.collection<ScratchpadDoc>("scratchpads").find();
  assert.deepEqual(pads.map((s) => [s.projectId, s.content]), [[b._id, "b notes"]]);
  assert.equal(await store.collection("projects").count(), 1);
  for (const id of [a._id, BAD]) {
    assert.deepEqual(await call("DELETE", `/api/projects/${id}`), { status: 404, body: { error: "Project not found" } });
  }
});

// ── Tasks: list ──

test("list tasks: projectId required (400), malformed is 500, any-case hex accepted, unknown is []", async (t) => {
  quiet(t);
  const a = await project();
  const x = await task(a._id);
  for (const qs of ["", "?projectId=", "?other=1"]) {
    assert.deepEqual(await call("GET", `/api/tasks${qs}`), { status: 400, body: { error: "projectId query parameter is required" } });
  }
  assert.deepEqual(await call("GET", `/api/tasks?projectId=${BAD}`), { status: 500, body: { error: "Failed to fetch tasks" } });
  assert.deepEqual((await list(a._id.toUpperCase())).map((t) => t._id), [x._id]);
  assert.deepEqual(await list(UNKNOWN), []);
});

test("list tasks: sorted by status as a string, then order; another project's tasks left out", async () => {
  const a = await project();
  const b = await project({ name: "B" });
  await task(a._id, { title: "t0" });
  await task(a._id, { title: "t1" });
  await task(a._id, { title: "d0", status: "done" });
  await task(a._id, { title: "b0", status: "backlog" });
  await task(a._id, { title: "p0", status: "in_progress" });
  await task(a._id, { title: "r0", status: "in_review" });
  await task(b._id, { title: "other" });
  assert.deepEqual(await board(a._id), ["b0:backlog/0", "d0:done/0", "p0:in_progress/0", "r0:in_review/0", "t0:todo/0", "t1:todo/1"]);
});

// ── Tasks: create ──

test("create task: defaults, trims title/description/tags, order is the end of its column, client order ignored", async () => {
  const a = await project();
  const first = await task(a._id, { title: "  Write spec  ", description: "  REST  ", tags: ["  ui  ", "board", " "], order: 99 });
  assert.deepEqual(
    { ...first, _id: undefined, createdAt: undefined, updatedAt: undefined },
    {
      _id: undefined,
      createdAt: undefined,
      updatedAt: undefined,
      projectId: a._id,
      title: "Write spec",
      description: "REST",
      status: "todo",
      priority: "medium",
      tags: ["ui", "board", ""], // current behavior: an all-space tag is kept as ""
      order: 0,
    },
  );
  assert.equal((await task(a._id)).order, 1);
  assert.equal((await task(a._id, { status: "done" })).order, 0);
  assert.equal((await task(a._id, { status: "done" })).order, 1);
  // The end is max + 1, not the count: a gap stays a gap
  const third = await task(a._id);
  await call("DELETE", `/api/tasks/${(await list(a._id)).find((t) => t.order === 1 && t.status === "todo")!._id}`);
  assert.equal(third.order, 2);
  assert.equal((await task(a._id)).order, 3);
  // A project id in upper case is stored as MongoDB stores it, lower case
  assert.equal((await task(a._id.toUpperCase())).projectId, a._id);
});

test("create task: dueDate absent, \"\", date-only, ISO, local time without an offset", async () => {
  const a = await project();
  assert.equal("dueDate" in (await task(a._id)), false);
  assert.equal((await task(a._id, { dueDate: "" })).dueDate, null);
  assert.equal((await task(a._id, { dueDate: "2026-12-01" })).dueDate, "2026-12-01T00:00:00.000Z");
  assert.equal((await task(a._id, { dueDate: "2026-12-24T15:30:00.000Z" })).dueDate, "2026-12-24T15:30:00.000Z");
  // Read in the process's time zone, as Mongoose did on the server (npm test runs in New York)
  assert.equal((await task(a._id, { dueDate: "2026-12-01T10:00" })).dueDate, new Date("2026-12-01T10:00").toISOString());
  assert.equal(process.env.TZ, "America/New_York");
  assert.equal((await task(a._id, { dueDate: "2026-12-01T10:00" })).dueDate, "2026-12-01T15:00:00.000Z");
});

test("create task: 400 on validation and broken JSON; current behavior: bad date, malformed projectId, blank title are 500; unknown project accepted", async (t) => {
  quiet(t);
  const a = await project();
  const bad = await call("POST", "/api/tasks", { projectId: "", title: "", status: "nope", priority: "x", tags: "a", description: 5 });
  assert.equal(bad.status, 400);
  assert.equal((await call("POST", "/api/tasks", undefined)).status, 400);
  const failed = { status: 500, body: { error: "Failed to create task" } };
  assert.deepEqual(await call("POST", "/api/tasks", { projectId: a._id, title: "x", dueDate: "not a date" }), failed);
  assert.deepEqual(await call("POST", "/api/tasks", { projectId: BAD, title: "x" }), failed);
  assert.deepEqual(await call("POST", "/api/tasks", { projectId: a._id, title: "   " }), failed);
  assert.equal(await store.collection("tasks").count(), 0);
  // current behavior (Task 4): a well-formed id that matches no project creates an orphan task
  const orphan = await task(UNKNOWN, { title: "orphan" });
  assert.deepEqual((await list(UNKNOWN)).map((x) => x._id), [orphan._id]);
});

// ── Tasks: update ──

test("update task: sets the body; current behavior: omitted priority/tags/status reset, omitted description and dueDate kept", async () => {
  const a = await project();
  const x = await task(a._id, { priority: "high", tags: ["a"], description: "keep", dueDate: "2026-12-01" });
  const res = await call("PUT", `/api/tasks/${x._id}`, { projectId: a._id, title: " Renamed ", tags: [" kanban ", " ui"] });
  assert.equal(res.status, 200);
  const u = res.body as TaskDoc;
  assert.deepEqual(
    [u.title, u.priority, u.tags, u.description, u.dueDate, u.order, u.status],
    ["Renamed", "medium", ["kanban", "ui"], "keep", "2026-12-01T00:00:00.000Z", 0, "todo"],
  );
  assert.notEqual(u.updatedAt, x.updatedAt);
  // dueDate "" stores null; absent keeps null
  assert.equal(((await call("PUT", `/api/tasks/${x._id}`, { projectId: a._id, title: "R", dueDate: "" })).body as TaskDoc).dueDate, null);
  assert.equal(((await call("PUT", `/api/tasks/${x._id}`, { projectId: a._id, title: "R" })).body as TaskDoc).dueDate, null);
  assert.equal(((await call("PUT", `/api/tasks/${x._id}`, { projectId: a._id, title: "R", dueDate: "2026-12-05T08:00:00Z" })).body as TaskDoc).dueDate, "2026-12-05T08:00:00.000Z");
});

test("update task: current behavior: a status change keeps the order and can tie; ties list in insertion order", async () => {
  const a = await project();
  const e = await task(a._id, { title: "E", status: "backlog" });
  const x = await task(a._id, { title: "A" });
  await call("PUT", `/api/tasks/${x._id}`, { projectId: a._id, title: "A", status: "backlog" });
  // MongoDB sorts { status: 1, order: 1 } with no tie-breaker; the browser store's sort is stable
  assert.deepEqual((await list(a._id)).map((t) => [t._id, t.status, t.order]), [
    [e._id, "backlog", 0],
    [x._id, "backlog", 0],
  ]);
});

test("update task: moving to another project keeps the order (current behavior: may tie there)", async () => {
  const a = await project({ name: "A" });
  const b = await project({ name: "B" });
  await task(a._id, { title: "a0" });
  const moved = await task(a._id, { title: "a1" });
  await task(b._id, { title: "b0" });
  await task(b._id, { title: "b1" });
  const res = await call("PUT", `/api/tasks/${moved._id}`, { projectId: b._id.toUpperCase(), title: "a1" });
  assert.equal(res.status, 200);
  assert.equal((res.body as TaskDoc).projectId, b._id);
  assert.deepEqual(await board(a._id), ["a0:todo/0"]);
  // a1 ties with b1 on todo/1; the browser store lists ties in insertion order (a1 was created first)
  assert.deepEqual(await board(b._id), ["b0:todo/0", "a1:todo/1", "b1:todo/1"]);
  const rows = (await call("GET", "/api/projects")).body as ProjectRow[];
  assert.deepEqual(rows.map((p) => [p.name, p.taskCounts.total]), [["B", 3], ["A", 1]]);
});

test("update task: 404 before the body, 400 on validation and broken JSON, 500 on a bad cast or blank title", async (t) => {
  quiet(t);
  const a = await project();
  const x = await task(a._id, { title: "Keep" });
  for (const id of [UNKNOWN, BAD]) {
    assert.deepEqual(await call("PUT", `/api/tasks/${id}`, { projectId: a._id, title: "x" }), { status: 404, body: { error: "Task not found" } });
    assert.deepEqual(await call("PUT", `/api/tasks/${id}`, undefined), { status: 404, body: { error: "Task not found" } });
  }
  const bad = await call("PUT", `/api/tasks/${x._id}`, { projectId: "", title: "", status: "nope", tags: "a" });
  assert.equal(bad.status, 400);
  assert.deepEqual(Object.keys((bad.body as { details: { fieldErrors: object } }).details.fieldErrors).sort(), ["projectId", "status", "tags", "title"]);
  assert.equal((await call("PUT", `/api/tasks/${x._id}`, undefined)).status, 400);
  const failed = { status: 500, body: { error: "Failed to update task" } };
  assert.deepEqual(await call("PUT", `/api/tasks/${x._id}`, { projectId: BAD, title: "x" }), failed);
  assert.deepEqual(await call("PUT", `/api/tasks/${x._id}`, { projectId: a._id, title: "x", dueDate: "not a date" }), failed);
  assert.deepEqual(await call("PUT", `/api/tasks/${x._id}`, { projectId: a._id, title: "  " }), failed);
  const [stored] = await list(a._id);
  assert.deepEqual([stored.title, stored.updatedAt], ["Keep", x.updatedAt]);
});

// ── Tasks: delete ──

test("delete task: current behavior: leaves an order gap; unknown and malformed ids are 404", async () => {
  const a = await project();
  await task(a._id, { title: "t0" });
  const t1 = await task(a._id, { title: "t1" });
  await task(a._id, { title: "t2" });
  assert.deepEqual(await call("DELETE", `/api/tasks/${t1._id}`), { status: 200, body: { message: "Task deleted" } });
  assert.deepEqual(await board(a._id), ["t0:todo/0", "t2:todo/2"]);
  for (const id of [t1._id, BAD]) {
    assert.deepEqual(await call("DELETE", `/api/tasks/${id}`), { status: 404, body: { error: "Task not found" } });
  }
});

// ── Tasks: reorder ──

async function column(): Promise<{ a: ProjectDoc; b: ProjectDoc; ids: Record<string, string> }> {
  const a = await project({ name: "A" });
  const b = await project({ name: "B" });
  const ids: Record<string, string> = {};
  for (const title of ["t0", "t1", "t2", "t3"]) ids[title] = (await task(a._id, { title }))._id;
  for (const title of ["d0", "d1"]) ids[title] = (await task(a._id, { title, status: "done" }))._id;
  // Another project's column with the same orders must never shift
  for (const title of ["o0", "o1", "o2"]) ids[title] = (await task(b._id, { title }))._id;
  return { a, b, ids };
}

const reorder = (id: string, status: string, order: number) => call("PATCH", `/api/tasks/${id}/reorder`, { status, order });

test("reorder within a column: down shifts (old, new] up, up shifts [new, old) down", async () => {
  const { a, b, ids } = await column();
  const down = await reorder(ids.t0, "todo", 2);
  assert.equal(down.status, 200);
  assert.deepEqual([(down.body as TaskDoc).status, (down.body as TaskDoc).order], ["todo", 2]);
  assert.deepEqual(await board(a._id), ["d0:done/0", "d1:done/1", "t1:todo/0", "t2:todo/1", "t0:todo/2", "t3:todo/3"]);
  await reorder(ids.t3, "todo", 0);
  assert.deepEqual(await board(a._id), ["d0:done/0", "d1:done/1", "t3:todo/0", "t1:todo/1", "t2:todo/2", "t0:todo/3"]);
  assert.deepEqual(await board(b._id), ["o0:todo/0", "o1:todo/1", "o2:todo/2"]);
});

test("reorder across columns, past the end, and to the same place (updatedAt moves anyway)", async () => {
  const { a, b, ids } = await column();
  await reorder(ids.t1, "done", 0);
  assert.deepEqual(await board(a._id), ["t1:done/0", "d0:done/1", "d1:done/2", "t0:todo/0", "t2:todo/1", "t3:todo/2"]);
  await reorder(ids.t0, "in_review", 7);
  assert.deepEqual(await board(a._id), ["t1:done/0", "d0:done/1", "d1:done/2", "t0:in_review/7", "t2:todo/0", "t3:todo/1"]);
  assert.deepEqual(await board(b._id), ["o0:todo/0", "o1:todo/1", "o2:todo/2"]);

  const before = await list(a._id);
  const same = await reorder(ids.t2, "todo", 0);
  const after = await list(a._id);
  const at = (rows: TaskDoc[], id: string) => rows.find((t) => t._id === id)!.updatedAt;
  assert.notEqual((same.body as TaskDoc).updatedAt, at(before, ids.t2));
  assert.equal(at(after, ids.t3), at(before, ids.t3)); // nothing else moved
});

test("reorder: tasks shifted by the update get a new updatedAt", async () => {
  const { a, ids } = await column();
  const before = await list(a._id);
  await reorder(ids.d1, "done", 0);
  const after = await list(a._id);
  const at = (rows: TaskDoc[], id: string) => rows.find((t) => t._id === id)!.updatedAt;
  assert.notEqual(at(after, ids.d0), at(before, ids.d0));
  assert.equal(at(after, ids.t0), at(before, ids.t0));
});

test("reorder: 404 before the body, 400 on validation and broken JSON", async () => {
  const { ids } = await column();
  for (const id of [UNKNOWN, BAD]) {
    assert.deepEqual(await reorder(id, "todo", 0), { status: 404, body: { error: "Task not found" } });
  }
  assert.equal((await reorder(ids.t0, "nope", -1)).status, 400);
  assert.equal((await reorder(ids.t0, "todo", 1.5)).status, 400);
  assert.equal((await call("PATCH", `/api/tasks/${ids.t0}/reorder`, undefined)).status, 400);
});

// ── Scratchpad ──

test("scratchpad: created empty on first read, then the same one; PUT sets the content", async () => {
  const a = await project();
  const first = await call("GET", `/api/projects/${a._id}/scratchpad`);
  assert.equal(first.status, 200);
  const pad = first.body as ScratchpadDoc;
  assert.deepEqual([pad.projectId, pad.content], [a._id, ""]);
  assert.deepEqual(await call("GET", `/api/projects/${a._id}/scratchpad`), { status: 200, body: pad });
  assert.equal(await store.collection("scratchpads").count(), 1);

  const put = (await call("PUT", `/api/projects/${a._id}/scratchpad`, { content: "# Notes  " })).body as ScratchpadDoc;
  assert.deepEqual([put._id, put.content], [pad._id, "# Notes  "]);
  assert.notEqual(put.updatedAt, pad.updatedAt);
  // No content is "" (the schema's default)
  assert.equal(((await call("PUT", `/api/projects/${a._id}/scratchpad`, {})).body as ScratchpadDoc).content, "");
});

test("scratchpad: PUT upserts on a project with none; exactly 50,000 characters pass, 50,001 do not", async () => {
  const a = await project();
  const put = await call("PUT", `/api/projects/${a._id}/scratchpad`, { content: "x".repeat(50_000) });
  assert.equal(put.status, 200);
  assert.equal((put.body as ScratchpadDoc).projectId, a._id);
  assert.equal((put.body as ScratchpadDoc).content.length, 50_000);
  const tooLong = await call("PUT", `/api/projects/${a._id}/scratchpad`, { content: "x".repeat(50_001) });
  assert.equal(tooLong.status, 400);
  assert.equal(((await call("GET", `/api/projects/${a._id}/scratchpad`)).body as ScratchpadDoc).content.length, 50_000);
  assert.equal(await store.collection("scratchpads").count(), 1);
});

test("scratchpad: unknown and malformed project ids are 404 (before the body); broken JSON is 400", async () => {
  const a = await project();
  for (const id of [UNKNOWN, BAD]) {
    assert.deepEqual(await call("GET", `/api/projects/${id}/scratchpad`), { status: 404, body: { error: "Project not found" } });
    assert.deepEqual(await call("PUT", `/api/projects/${id}/scratchpad`, { content: "x" }), { status: 404, body: { error: "Project not found" } });
    assert.deepEqual(await call("PUT", `/api/projects/${id}/scratchpad`, undefined), { status: 404, body: { error: "Project not found" } });
  }
  assert.equal((await call("PUT", `/api/projects/${a._id}/scratchpad`, undefined)).status, 400);
  assert.equal(await store.collection("scratchpads").count(), 0);
});

/** `inner` with every collection call yielding to the macrotask queue first, so two requests interleave. */
function interleaving(inner: Store): Store {
  return {
    collection<T extends BaseDoc>(name: CollectionName): Collection<T> {
      const real = inner.collection<T>(name);
      return new Proxy(real, {
        get(target, prop) {
          const value = Reflect.get(target, prop, target);
          if (typeof value !== "function") return value;
          return async (...args: unknown[]) => {
            await new Promise((resolve) => setImmediate(resolve));
            return value.apply(target, args);
          };
        },
      });
    },
  };
}

test("current behavior (Task 4): two overlapping first scratchpad reads; the second fails on the unique index with 500", async (t) => {
  quiet(t);
  const a = await project();
  const racing = interleaving(store);
  const read = () => dispatch(projectsRoutes, racing, "GET", `/api/projects/${a._id}/scratchpad`);
  const results = await Promise.all([read(), read()]);
  assert.deepEqual(results.map((r) => r.status).sort(), [200, 500]);
  assert.deepEqual(results.find((r) => r.status === 500)!.body, { error: "Failed to fetch scratchpad" });
  assert.equal(await store.collection("scratchpads").count(), 1);
});

// ── Casting helpers ──

test("castId: 24 hex digits in either case, lower-cased; anything else throws", () => {
  assert.equal(castId("A".repeat(24)), "a".repeat(24));
  for (const bad of ["abc", "abcdefghijkl", ` ${"a".repeat(24)}`, "g".repeat(24)]) {
    assert.throws(() => castId(bad), { message: "Invalid id" });
  }
});

test("castDate: as Mongoose casts a date string", () => {
  assert.equal(castDate(""), null);
  assert.equal(castDate("2026"), "2026-01-01T00:00:00.000Z");
  assert.equal(castDate("300000"), "1970-01-01T00:05:00.000Z"); // milliseconds past the year range
  assert.equal(castDate("12/01/2026"), new Date("12/01/2026").toISOString());
  for (const bad of ["not a date", "  "]) assert.throws(() => castDate(bad));
});
