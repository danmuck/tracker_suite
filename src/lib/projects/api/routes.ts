// Route table for the Projects API (projects, kanban tasks, scratchpad), dispatched against a Store.
// Pure: no framework, browser or server imports.

import type { Handler, RouteDef } from "@/lib/data/api";
import { ConflictError } from "@/lib/data/store";
import {
  createProject,
  createTask,
  deleteProject,
  deleteTask,
  getProject,
  getScratchpad,
  listProjects,
  listTasks,
  reorderTask,
  updateProject,
  updateScratchpad,
  updateTask,
} from "./handlers";

/**
 * A unique-index race on the scratchpad (two overlapping first reads or upserts) stays a plain
 * error, the route's 500 failure string as today, instead of the adapter's 409 for ConflictError.
 */
const noConflict =
  (handler: Handler): Handler =>
  async (ctx) => {
    try {
      return await handler(ctx);
    } catch (error) {
      if (error instanceof ConflictError) throw new Error(error.message);
      throw error;
    }
  };

export const projectsRoutes: RouteDef[] = [
  { method: "GET", path: "/api/projects", handler: listProjects, failure: "Failed to fetch projects" },
  { method: "POST", path: "/api/projects", handler: createProject, failure: "Failed to create project" },
  { method: "GET", path: "/api/projects/:projectId", handler: getProject, failure: "Failed to fetch project" },
  { method: "PUT", path: "/api/projects/:projectId", handler: updateProject, failure: "Failed to update project" },
  { method: "DELETE", path: "/api/projects/:projectId", handler: deleteProject, failure: "Failed to delete project" },
  { method: "GET", path: "/api/projects/:projectId/scratchpad", handler: noConflict(getScratchpad), failure: "Failed to fetch scratchpad" },
  { method: "PUT", path: "/api/projects/:projectId/scratchpad", handler: noConflict(updateScratchpad), failure: "Failed to update scratchpad" },
  { method: "GET", path: "/api/tasks", handler: listTasks, failure: "Failed to fetch tasks" },
  { method: "POST", path: "/api/tasks", handler: createTask, failure: "Failed to create task" },
  { method: "PUT", path: "/api/tasks/:taskId", handler: updateTask, failure: "Failed to update task" },
  { method: "DELETE", path: "/api/tasks/:taskId", handler: deleteTask, failure: "Failed to delete task" },
  { method: "PATCH", path: "/api/tasks/:taskId/reorder", handler: reorderTask, failure: "Failed to reorder task" },
];
