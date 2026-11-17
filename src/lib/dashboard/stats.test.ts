import { test } from "node:test";
import assert from "node:assert/strict";
import { projectRollup, weekDelta } from "./stats";

const project = (name: string, status: "active" | "archived" | "completed", total?: number, done?: number) => ({
  _id: name,
  name,
  status,
  taskCounts: total === undefined ? undefined : { total, done: done ?? 0 },
});

test("projectRollup counts statuses and rolls up tasks of active projects only", () => {
  const r = projectRollup([
    project("A", "active", 10, 4),
    project("B", "active", 5, 5),
    project("C", "completed", 8, 8),
    project("D", "archived", 3, 0),
  ]);
  assert.deepEqual([r.active, r.completed, r.archived], [2, 1, 1]);
  assert.deepEqual([r.totalTasks, r.doneTasks, r.openTasks], [15, 9, 6]);
  assert.equal(r.completion, 0.6);
});

test("projectRollup orders active projects by open tasks, then name", () => {
  const r = projectRollup([
    project("Zed", "active", 4, 2),
    project("Alpha", "active", 4, 2),
    project("Big", "active", 9, 1),
    project("None", "active"),
  ]);
  assert.deepEqual(
    r.progress.map((p) => p.name),
    ["Big", "Alpha", "Zed", "None"]
  );
  assert.deepEqual(r.progress[3], { id: "None", name: "None", total: 0, done: 0, open: 0 });
});

test("projectRollup has no completion without tasks", () => {
  assert.equal(projectRollup([]).completion, null);
  assert.equal(projectRollup([project("A", "active")]).completion, null);
});

test("weekDelta words the change", () => {
  assert.equal(weekDelta(3, 1), "+2 vs last week");
  assert.equal(weekDelta(1.5, 3), "-1.5 vs last week");
  assert.equal(weekDelta(2, 2), "same as last week");
  assert.equal(weekDelta(0.1 + 0.2, 0.3), "same as last week");
});
