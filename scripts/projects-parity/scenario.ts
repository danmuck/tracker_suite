// The Projects parity scenario: an ordered list of requests that drives every Projects route
// (projects, kanban tasks, scratchpad) from an empty database. Pure: no clock, no network.
//
// `{name}` in `path` and in any string inside `body` is replaced with the id saved under that name;
// `{unknown}` is a well-formed id that matches nothing (UNKNOWN_ID). `save.from` is a dot path into the
// response body. `expect` is the status today's (unconverted) routes answer. `allow` marks a step whose
// status is an intended difference after the conversion (D1a: malformed id in a path → the route's 404;
// D1c: unparseable JSON body → 400): a run on converted code may answer `allow.status` (with
// `allow.error`) instead, and nothing else. `ties` marks a task list that holds a tie in
// (status, order) on purpose: MongoDB orders a tied pair arbitrarily, so the runner orders tied items
// by title before recording (see normalize.ts, orderCheck).
//
// Ties in (status, order) within one project: creating a task never makes one (it takes max + 1 in its
// column), deleting one leaves a gap, not a tie, and the reorder route shifts the others. `PUT
// /api/tasks/:id` with a new status keeps the task's order, so it can land on an order already taken
// in the new column: U04 does exactly that (tA lands on backlog 0 beside tE) and U05 reads the tied
// list; U06 moves tA back to a free slot before any other list is read.

export interface Step {
  id: string;
  method: "GET" | "POST" | "PUT" | "PATCH" | "DELETE";
  path: string;
  body?: unknown;
  rawBody?: string;
  save?: { name: string; from: string };
  expect: number | null;
  allow?: { rule: "D1a" | "D1c"; status: number; error?: string };
  ties?: true;
}

/** Well-formed ObjectId that matches no document; saved as `unknown` before the first step. */
export const UNKNOWN_ID = "bbbbbbbbbbbbbbbbbbbbbbbb";

export function buildScenario(): Step[] {
  const RAW = "{";
  const BAD = "abc"; // malformed id

  const d1a = (error: string) => ({ rule: "D1a" as const, status: 404, error });
  const d1c = () => ({ rule: "D1c" as const, status: 400, error: "Validation failed" });
  const PROJECT_NOT_FOUND = "Project not found";
  const TASK_NOT_FOUND = "Task not found";

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
  const task = (project: string, title: string, extra: Record<string, unknown> = {}) => ({ projectId: `{${project}}`, title, ...extra });

  return [
    // ── Projects ──
    // Names, descriptions and URLs are trimmed by the schema; unknown keys are stripped by Zod
    send(
      "P01",
      "POST",
      "/api/projects",
      { name: "  Parity Alpha  ", description: "  first project  ", repositoryUrl: "https://example.com/alpha", color: "#10b981" },
      201,
      { save: { name: "p1", from: "_id" } },
    ),
    // Empty repositoryUrl is dropped; status and color take their defaults
    send("P02", "POST", "/api/projects", { name: "Parity Beta", repositoryUrl: "" }, 201, { save: { name: "p2", from: "_id" } }),
    send("P03", "POST", "/api/projects", { name: "Parity Gamma", status: "archived", description: "to be deleted", order: 7 }, 201, {
      save: { name: "p3", from: "_id" },
    }),
    send("P04", "POST", "/api/projects", { name: "", status: "paused", color: "blue", repositoryUrl: "not a url", description: "x".repeat(501) }, 400),
    // current behavior: a blank name passes Zod (length 3), the schema trims it to "" and `required` fails → 500
    send("P05", "POST", "/api/projects", { name: "   " }, 500),
    raw("P06", "POST", "/api/projects", 500, { allow: d1c() }),
    // Task counts with no tasks anywhere
    get("P07", "/api/projects?status=archived", 200),
    get("P08", "/api/projects/{unknown}", 404),
    get("P09", `/api/projects/${BAD}`, 500, { allow: d1a(PROJECT_NOT_FOUND) }),
    send(
      "P10",
      "PUT",
      "/api/projects/{p1}",
      { name: "Parity Alpha", description: "  updated  ", repositoryUrl: "https://example.com/alpha-2", color: "#ef4444", status: "completed" },
      200,
    ),
    // "" removes repositoryUrl (Task 4; before, the old URL stayed). current behavior: omitted status
    // and color are reset to Zod's defaults; omitted description is left as it was
    send("P11", "PUT", "/api/projects/{p1}", { name: "Parity Alpha", repositoryUrl: "" }, 200),
    send("P12", "PUT", "/api/projects/{p1}", { name: "", color: "#12345" }, 400),
    send("P13", "PUT", `/api/projects/${BAD}`, { name: "x" }, 500, { allow: d1a(PROJECT_NOT_FOUND) }),
    // The project is looked up before the body is read: an unknown id with a broken body is a 404
    raw("P14", "PUT", "/api/projects/{unknown}", 404),
    // A successful read after the updates: no URL, description kept, defaults reset by P11
    get("P15", "/api/projects/{p1}", 200),
    // What the project form sends when the description is emptied ("" stores "") and a URL is set again
    send("P16", "PUT", "/api/projects/{p1}", { name: "Parity Alpha", description: "", repositoryUrl: "https://example.com/alpha-3" }, 200),

    // ── Tasks: create and list ──
    get("T01", "/api/tasks", 400),
    get("T02", `/api/tasks?projectId=${BAD}`, 500),
    // Defaults; a client `order` is stripped and the order is assigned (end of the column)
    send("T03", "POST", "/api/tasks", task("p1", "  Parity write spec  ", { order: 99, dueDate: "" }), 201, { save: { name: "tA", from: "_id" } }),
    send("T04", "POST", "/api/tasks", task("p1", "Parity build board", { priority: "high", tags: ["  ui  ", "board", " "], dueDate: "2026-12-01" }), 201, {
      save: { name: "tB", from: "_id" },
    }),
    send("T05", "POST", "/api/tasks", task("p1", "Parity wire API", { status: "todo", dueDate: "2026-12-24T15:30:00.000Z", description: "  REST  " }), 201, {
      save: { name: "tC", from: "_id" },
    }),
    send("T06", "POST", "/api/tasks", task("p1", "Parity polish"), 201, { save: { name: "tD", from: "_id" } }),
    send("T07", "POST", "/api/tasks", task("p1", "Parity backlog idea", { status: "backlog", priority: "low" }), 201, { save: { name: "tE", from: "_id" } }),
    send("T08", "POST", "/api/tasks", task("p1", "Parity in progress", { status: "in_progress", priority: "urgent" }), 201, { save: { name: "tG", from: "_id" } }),
    send("T09", "POST", "/api/tasks", task("p1", "Parity shipped", { status: "done" }), 201, { save: { name: "tI", from: "_id" } }),
    send("T10", "POST", "/api/tasks", task("p2", "Parity beta task"), 201, { save: { name: "tK", from: "_id" } }),
    send("T11", "POST", "/api/tasks", task("p3", "Parity gamma task", { status: "in_review" }), 201, { save: { name: "tM", from: "_id" } }),
    send("T12", "POST", "/api/tasks", { projectId: "", title: "", status: "nope", priority: "x", tags: "a", description: 5 }, 400),
    // current behavior: Zod accepts any dueDate string; the schema cannot cast this one → 500
    send("T13", "POST", "/api/tasks", task("p1", "Parity bad date", { dueDate: "not a date" }), 500),
    send("T14", "POST", "/api/tasks", { projectId: BAD, title: "x" }, 500),
    // A well-formed projectId that matches no project: 404, nothing written (Task 4; before, an orphan task)
    send("T15", "POST", "/api/tasks", { projectId: "{unknown}", title: "Parity orphan" }, 404),
    // Sorted by status as a string (backlog, done, in_progress, in_review, todo), then order
    get("T16", "/api/tasks?projectId={p1}", 200),
    get("T17", "/api/tasks?projectId={unknown}", 200),
    // Task counts: some done
    get("T18", "/api/projects", 200),

    // ── Tasks: update ──
    // Tags trimmed (an all-space tag becomes ""), date-only dueDate, a new description
    send(
      "U01",
      "PUT",
      "/api/tasks/{tB}",
      task("p1", "  Parity build board v2 ", { priority: "urgent", tags: [" kanban ", " ui"], dueDate: "2026-12-05", description: "  board  " }),
      200,
    ),
    // dueDate "" stores null
    send("U02", "PUT", "/api/tasks/{tC}", task("p1", "Parity wire API", { dueDate: "" }), 200),
    // dueDate absent: kept. current behavior: priority and tags reset to Zod's defaults, description kept
    send("U03", "PUT", "/api/tasks/{tB}", task("p1", "Parity build board v2"), 200),
    // current behavior: a status change through PUT keeps the order → tA lands on backlog 0 beside tE
    send("U04", "PUT", "/api/tasks/{tA}", task("p1", "Parity write spec", { status: "backlog" }), 200),
    get("U05", "/api/tasks?projectId={p1}", 200, { ties: true }),
    // Back to todo 0, which is free again: no tie remains
    send("U06", "PUT", "/api/tasks/{tA}", task("p1", "Parity write spec", { status: "todo" }), 200),
    send("U07", "PUT", "/api/tasks/{unknown}", task("p1", "x"), 404),
    send("U08", "PUT", `/api/tasks/${BAD}`, task("p1", "x"), 500, { allow: d1a(TASK_NOT_FOUND) }),
    raw("U09", "PUT", "/api/tasks/{tA}", 500, { allow: d1c() }),
    // What the task form sends when the description is emptied: "" stores ""
    send("U10", "PUT", "/api/tasks/{tC}", task("p1", "Parity wire API", { description: "" }), 200),

    // ── Tasks: delete ──
    // tB (todo 1) goes; todo keeps tA 0, tC 2, tD 3: a gap, not renumbered
    del("D01", "/api/tasks/{tB}", 200),
    del("D02", "/api/tasks/{tB}", 404),
    del("D03", `/api/tasks/${BAD}`, 500, { allow: d1a(TASK_NOT_FOUND) }),
    get("D04", "/api/tasks?projectId={p1}", 200),

    // ── Tasks: reorder ──
    // Down within todo (0 → 2): (0, 2] shift up, the gap at 1 absorbs nothing → tC 1, tA 2, tD 3
    send("R01", "PATCH", "/api/tasks/{tA}/reorder", { status: "todo", order: 2 }, 200),
    // Up within todo (3 → 1): [1, 3) shift down → tD 1, tC 2, tA 3
    send("R02", "PATCH", "/api/tasks/{tD}/reorder", { status: "todo", order: 1 }, 200),
    // Same place: nothing shifts
    send("R03", "PATCH", "/api/tasks/{tC}/reorder", { status: "todo", order: 2 }, 200),
    // Across columns: in_progress closes its gap, done makes room at 0 (tI → 1)
    send("R04", "PATCH", "/api/tasks/{tG}/reorder", { status: "done", order: 0 }, 200),
    // Across columns to an order past the end of the new column (in_progress is empty)
    send("R05", "PATCH", "/api/tasks/{tA}/reorder", { status: "in_progress", order: 7 }, 200),
    get("R06", "/api/tasks?projectId={p1}", 200),
    send("R07", "PATCH", "/api/tasks/{tA}/reorder", { status: "nope", order: -1 }, 400),
    send("R08", "PATCH", "/api/tasks/{unknown}/reorder", { status: "todo", order: 0 }, 404),
    send("R09", "PATCH", `/api/tasks/${BAD}/reorder`, { status: "todo", order: 0 }, 500, { allow: d1a(TASK_NOT_FOUND) }),
    raw("R10", "PATCH", "/api/tasks/{tA}/reorder", 500, { allow: d1c() }),

    // ── Scratchpad ──
    // First read creates it
    get("S01", "/api/projects/{p1}/scratchpad", 200, { save: { name: "s1", from: "_id" } }),
    send("S02", "PUT", "/api/projects/{p1}/scratchpad", { content: "# Notes\n\n- parity  " }, 200),
    send("S03", "PUT", "/api/projects/{p1}/scratchpad", { content: "x".repeat(50_001) }, 400),
    // Upsert on a project that has none
    send("S04", "PUT", "/api/projects/{p2}/scratchpad", { content: "beta notes" }, 200, { save: { name: "s2", from: "_id" } }),
    get("S05", "/api/projects/{unknown}/scratchpad", 404),
    get("S06", `/api/projects/${BAD}/scratchpad`, 500, { allow: d1a(PROJECT_NOT_FOUND) }),
    send("S07", "PUT", `/api/projects/${BAD}/scratchpad`, { content: "x" }, 500, { allow: d1a(PROJECT_NOT_FOUND) }),
    // p3 gets a scratchpad so the cascade delete (X01) has one to remove (not visible over HTTP: the
    // handler tests prove it is gone)
    get("S08", "/api/projects/{p3}/scratchpad", 200, { save: { name: "s3", from: "_id" } }),

    // ── Cascade delete ──
    del("X01", "/api/projects/{p3}", 200),
    get("X02", "/api/tasks?projectId={p3}", 200),
    del("X03", "/api/projects/{p3}", 404),
    del("X04", `/api/projects/${BAD}`, 500, { allow: d1a(PROJECT_NOT_FOUND) }),
    // Another project's tasks and scratchpads are untouched
    get("X05", "/api/tasks?projectId={p2}", 200),
    get("X06", "/api/projects/{p2}/scratchpad", 200),
    get("X07", "/api/projects/{p1}/scratchpad", 200),
    get("X08", "/api/projects", 200),
    // A task for a project deleted meanwhile (another tab): 404, nothing written (Task 4)
    send("X09", "POST", "/api/tasks", task("p3", "Parity too late"), 404),
    get("X10", "/api/tasks?projectId={p3}", 200),
  ];
}
