import type { Project } from "../../types/projects/project";

type ProjectLike = Pick<Project, "_id" | "name" | "status" | "taskCounts">;

export interface ProjectProgress {
  id: string;
  name: string;
  total: number;
  done: number;
  open: number;
}

export interface ProjectRollup {
  active: number;
  completed: number;
  archived: number;
  /** Tasks across active projects */
  totalTasks: number;
  doneTasks: number;
  openTasks: number;
  /** Done share of all tasks in active projects, 0 to 1; null when there are no tasks */
  completion: number | null;
  /** Active projects, most open tasks first (ties by name) */
  progress: ProjectProgress[];
}

/** Status counts and task progress. Task figures cover active projects only. */
export function projectRollup(projects: ProjectLike[]): ProjectRollup {
  const count = (status: Project["status"]) => projects.filter((p) => p.status === status).length;
  const progress = projects
    .filter((p) => p.status === "active")
    .map((p) => {
      const total = p.taskCounts?.total ?? 0;
      const done = Math.min(p.taskCounts?.done ?? 0, total);
      return { id: p._id, name: p.name, total, done, open: total - done };
    })
    .sort((a, b) => b.open - a.open || a.name.localeCompare(b.name));
  const totalTasks = progress.reduce((n, p) => n + p.total, 0);
  const doneTasks = progress.reduce((n, p) => n + p.done, 0);
  return {
    active: count("active"),
    completed: count("completed"),
    archived: count("archived"),
    totalTasks,
    doneTasks,
    openTasks: totalTasks - doneTasks,
    completion: totalTasks > 0 ? doneTasks / totalTasks : null,
    progress,
  };
}

/** "+2 vs last week", "-1.5 vs last week", "same as last week" */
export function weekDelta(thisWeek: number, lastWeek: number): string {
  const diff = Math.round((thisWeek - lastWeek) * 100) / 100;
  if (diff === 0) return "same as last week";
  return `${diff > 0 ? "+" : "-"}${Math.abs(diff)} vs last week`;
}
