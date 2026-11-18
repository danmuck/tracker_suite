// Projects API logic (projects, kanban tasks, scratchpad) as store-backed handlers, shared by the
// server and browser data modes. Pure: no framework, browser or server imports.
//
// The Mongoose schemas in src/models/projects/ are the source of every default and trim here.
// Handlers never rely on Mongoose to fill, trim or cast: documents are built complete, so both
// stores hold and return the same JSON. Where today's routes failed inside Mongoose (a cast or a
// `required` after trimming), the handler throws, which the adapter answers with the route's 500.

import { fail, invalid, notFound, ok, type Handler } from "@/lib/data/api";
import { ConflictError, type BaseDoc, type Collection, type Store } from "@/lib/data/store";
import { projectSchema, scratchpadSchema, taskReorderSchema, taskSchema } from "@/lib/projects/validators";
import type { Project } from "@/types/projects/project";
import type { Scratchpad } from "@/types/projects/scratchpad";
import type { Task } from "@/types/projects/task";

export type ProjectDoc = Omit<Project, "taskCounts">;
// A task's dueDate is an ISO instant, or null when it was sent as "" (Mongoose casts "" to null).
export type TaskDoc = Omit<Task, "dueDate"> & { dueDate?: string | null };
export type ScratchpadDoc = Scratchpad;

const PROJECT = "Project";
const TASK = "Task";

export const projects = (store: Store): Collection<ProjectDoc> => store.collection<ProjectDoc>("projects");
export const tasks = (store: Store): Collection<TaskDoc> => store.collection<TaskDoc>("tasks");
export const scratchpads = (store: Store): Collection<ScratchpadDoc> => store.collection<ScratchpadDoc>("scratchpads");

/**
 * A query or body projectId as Mongoose casts it to an ObjectId: 24 hex digits in either case,
 * stored lowercase. Anything else failed the cast today (the route's 500), so it throws.
 */
export function castId(value: string): string {
  if (typeof value !== "string" || !/^[0-9a-f]{24}$/i.test(value)) throw new Error("Invalid id");
  return value.toLowerCase();
}

/** `value` trimmed (the schema's `trim`); a required field that trims to "" fails as it did in Mongoose. */
export function requiredText(value: string, field: string): string {
  const trimmed = value.trim();
  if (trimmed === "") throw new Error(`${field} is required`);
  return trimmed;
}

/**
 * A dueDate as Mongoose 9.2.1 casts it (lib/cast/date.js), as an ISO string: "" is null, a numeric
 * string outside the year range is milliseconds, anything else goes through `new Date()` (so a
 * local time without an offset is read in the process's time zone, as on the server today).
 * An unparseable value throws.
 */
export function castDate(value: string): string | null {
  if (value === "") return null;
  const n = Number(value);
  const date = !Number.isNaN(n) && (n >= 275761 || n < -271820) ? new Date(n) : new Date(value);
  if (Number.isNaN(date.valueOf())) throw new Error(`Invalid date: ${value}`);
  return date.toISOString();
}

/**
 * The project fields a create or full update sets. An empty repositoryUrl is not set: a create leaves
 * it out, an update removes it (`projectUnset`).
 */
function projectFields(data: ReturnType<typeof projectSchema.parse>): Record<string, unknown> {
  const out: Record<string, unknown> = {
    name: requiredText(data.name, "name"),
    status: data.status,
    color: data.color,
  };
  if (data.description !== undefined) out.description = data.description.trim();
  if (data.repositoryUrl) out.repositoryUrl = data.repositoryUrl.trim();
  return out;
}

/** The task fields a create or update writes; an absent description or dueDate is left out. */
function taskFields(data: ReturnType<typeof taskSchema.parse>): Record<string, unknown> {
  const out: Record<string, unknown> = {
    projectId: castId(data.projectId),
    title: requiredText(data.title, "title"),
    status: data.status,
    priority: data.priority,
    tags: data.tags.map((t) => t.trim()),
  };
  if (data.description !== undefined) out.description = data.description.trim();
  if (data.dueDate !== undefined) out.dueDate = castDate(data.dueDate);
  return out;
}

// ── Projects ──

/** Newest first, optional ?status= (any value, matched exactly), each with its task counts. */
export const listProjects: Handler = async ({ store, query }) => {
  const status = query.get("status");
  const list = await projects(store).find(status ? { status } : {}, { sort: { createdAt: -1 } });
  const ids = list.map((p) => p._id);
  const counts = new Map<string, { total: number; done: number }>();
  for (const t of await tasks(store).find({ projectId: { $in: ids } }, { select: ["projectId", "status"] })) {
    const key = String(t.projectId);
    const c = counts.get(key) ?? { total: 0, done: 0 };
    c.total += 1;
    if (t.status === "done") c.done += 1;
    counts.set(key, c);
  }
  return ok(list.map((p) => ({ ...p, taskCounts: counts.get(p._id) ?? { total: 0, done: 0 } })));
};

export const createProject: Handler = async ({ store, body }) => {
  const parsed = projectSchema.safeParse(body);
  if (!parsed.success) return invalid(parsed.error);
  const doc = projectFields(parsed.data) as Omit<ProjectDoc, keyof BaseDoc>;
  return ok(await projects(store).insert(doc), 201);
};

export const getProject: Handler = async ({ store, params }) => {
  const project = await projects(store).findById(params.projectId);
  return project ? ok(project) : notFound(PROJECT);
};

/**
 * Sets what the body holds; an empty repositoryUrl removes the URL, an empty description stores "".
 * current behavior: an omitted status or color is reset to its default (Zod fills it), an omitted
 * description or repositoryUrl is kept. The project is looked up before the body is read.
 */
export const updateProject: Handler = async ({ store, params, body }) => {
  if (!(await projects(store).findById(params.projectId))) return notFound(PROJECT);
  const parsed = projectSchema.safeParse(body);
  if (!parsed.success) return invalid(parsed.error);
  // Built before the write, so a blank name (500) writes nothing. An empty repositoryUrl is never
  // in $set, so the two parts never share a path.
  const $set = projectFields(parsed.data);
  const update = parsed.data.repositoryUrl === "" ? { $set, $unset: { repositoryUrl: 1 as const } } : { $set };
  // Deleted between the read and the write: today's findByIdAndUpdate answered 200 null.
  return ok(await projects(store).updateById(params.projectId, update));
};

/** Deletes the project, its tasks and its scratchpad. */
export const deleteProject: Handler = async ({ store, params }) => {
  const project = await projects(store).findById(params.projectId);
  if (!project) return notFound(PROJECT);
  await tasks(store).deleteMany({ projectId: project._id });
  await scratchpads(store).deleteMany({ projectId: project._id });
  await projects(store).deleteById(project._id);
  return ok({ message: "Project and associated data deleted" });
};

// ── Scratchpad ──

/**
 * The project's scratchpad, created empty on first read. Two overlapping first reads can both try
 * to create it: the one that loses on the unique projectId index answers the one that won.
 */
export const getScratchpad: Handler = async ({ store, params }) => {
  const project = await projects(store).findById(params.projectId);
  if (!project) return notFound(PROJECT);
  const pads = scratchpads(store);
  const existing = await pads.findOne({ projectId: project._id });
  if (existing) return ok(existing);
  try {
    return ok(await pads.insert({ projectId: project._id, content: "" }));
  } catch (error) {
    if (!(error instanceof ConflictError)) throw error;
    const created = await pads.findOne({ projectId: project._id });
    if (!created) throw error;
    return ok(created);
  }
};

/** Upsert: sets the content, creating the scratchpad if the project has none. */
export const updateScratchpad: Handler = async ({ store, params, body }) => {
  const project = await projects(store).findById(params.projectId);
  if (!project) return notFound(PROJECT);
  const parsed = scratchpadSchema.safeParse(body);
  if (!parsed.success) return invalid(parsed.error);
  return ok(
    await scratchpads(store).updateOne(
      { projectId: project._id },
      { $set: { content: parsed.data.content } },
      { upsert: true },
    ),
  );
};

// ── Tasks ──

/** A project's tasks by status (as a string), then order. Ties in (status, order) keep store order. */
export const listTasks: Handler = async ({ store, query }) => {
  const projectId = query.get("projectId");
  if (!projectId) return fail(400, "projectId query parameter is required");
  return ok(await tasks(store).find({ projectId: castId(projectId) }, { sort: { status: 1, order: 1 } }));
};

/**
 * Appends the task to the end of its column (max order + 1, else 0); a client `order` is ignored.
 * A well-formed projectId that matches no project is a 404 (checked after the body's casts).
 */
export const createTask: Handler = async ({ store, body }) => {
  const parsed = taskSchema.safeParse(body);
  if (!parsed.success) return invalid(parsed.error);
  const fields = taskFields(parsed.data);
  if (!(await projects(store).findById(fields.projectId as string))) return notFound(PROJECT);
  const last = await tasks(store).findOne(
    { projectId: fields.projectId, status: fields.status },
    { sort: { order: -1 } },
  );
  const doc = { ...fields, order: last ? last.order + 1 : 0 } as Omit<TaskDoc, keyof BaseDoc>;
  return ok(await tasks(store).insert(doc), 201);
};

/**
 * Sets what the body holds; the order is kept. current behavior: an omitted priority, status or
 * tags is reset to its default, an omitted description or dueDate is kept, and a status (or
 * project) change keeps the order, so it can tie with a task already there.
 */
export const updateTask: Handler = async ({ store, params, body }) => {
  if (!(await tasks(store).findById(params.taskId))) return notFound(TASK);
  const parsed = taskSchema.safeParse(body);
  if (!parsed.success) return invalid(parsed.error);
  // Deleted between the read and the write: today's findByIdAndUpdate answered 200 null.
  return ok(await tasks(store).updateById(params.taskId, { $set: taskFields(parsed.data) }));
};

/** current behavior: the column is not renumbered, so an order gap is left. */
export const deleteTask: Handler = async ({ store, params }) => {
  const deleted = await tasks(store).deleteById(params.taskId);
  return deleted ? ok({ message: "Task deleted" }) : notFound(TASK);
};

/**
 * Moves the task to `order` in `status`, shifting the tasks between its old and new place within the
 * project. The task itself is always written (its updatedAt moves even when it stays put).
 */
export const reorderTask: Handler = async ({ store, params, body }) => {
  const task = await tasks(store).findById(params.taskId);
  if (!task) return notFound(TASK);
  const parsed = taskReorderSchema.safeParse(body);
  if (!parsed.success) return invalid(parsed.error);

  const { status: newStatus, order: newOrder } = parsed.data;
  const { projectId, status: oldStatus, order: oldOrder } = task;
  const col = tasks(store);

  if (oldStatus === newStatus) {
    if (newOrder > oldOrder) {
      await col.updateMany(
        { projectId, status: oldStatus, order: { $gt: oldOrder, $lte: newOrder } },
        { $inc: { order: -1 } },
      );
    } else if (newOrder < oldOrder) {
      await col.updateMany(
        { projectId, status: oldStatus, order: { $gte: newOrder, $lt: oldOrder } },
        { $inc: { order: 1 } },
      );
    }
  } else {
    await col.updateMany({ projectId, status: oldStatus, order: { $gt: oldOrder } }, { $inc: { order: -1 } });
    await col.updateMany({ projectId, status: newStatus, order: { $gte: newOrder } }, { $inc: { order: 1 } });
  }

  return ok(await col.updateById(task._id, { $set: { status: newStatus, order: newOrder } }));
};
