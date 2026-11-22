// Sample Projects data: invented projects, tasks and notes, nothing real.

import type { ProjectFormData } from "@/types/projects/project";
import type { TaskPriority, TaskStatus } from "@/types/projects/task";

export interface ProjectsSampleTask {
  title: string;
  description?: string;
  status: TaskStatus;
  priority: TaskPriority;
  /** Days from today; absent means no due date. */
  dueInDays?: number;
  tags: string[];
}

export interface ProjectsSample {
  projects: (ProjectFormData & { tasks: ProjectsSampleTask[]; notes?: string })[];
}

export function projectsSample(): ProjectsSample {
  return {
    projects: [
      {
        name: "Garden Planner App",
        description: "A small web app for planning raised beds and watering (sample).",
        status: "active",
        repositoryUrl: "https://example.com/sample/garden-planner",
        color: "#10b981",
        notes: [
          "# Garden Planner",
          "",
          "## Next up",
          "- Finish the bed layout grid",
          "- Pick a chart library for the watering log",
          "",
          "## Ideas",
          "- Frost date reminders",
          "- Export a planting plan as **PDF**",
        ].join("\n"),
        tasks: [
          { title: "Seed-starting calendar", status: "backlog", priority: "low", tags: ["feature"] },
          { title: "Companion planting hints", status: "backlog", priority: "medium", tags: ["feature", "research"] },
          {
            title: "Bed layout grid",
            description: "Drag plants onto a grid sized to each bed.",
            status: "todo",
            priority: "high",
            dueInDays: 4,
            tags: ["ui"],
          },
          { title: "Watering log chart", status: "todo", priority: "medium", dueInDays: 10, tags: ["ui", "charts"] },
          { title: "Frost date lookup", status: "in_progress", priority: "urgent", dueInDays: 1, tags: ["api"] },
          { title: "Plant list search", status: "in_review", priority: "medium", dueInDays: -1, tags: ["ui"] },
          { title: "Project setup", status: "done", priority: "high", dueInDays: -12, tags: ["chore"] },
          { title: "Plant data model", status: "done", priority: "medium", dueInDays: -6, tags: ["backend"] },
        ],
      },
      {
        name: "Recipe Card Printer",
        description: "Script that turns saved recipes into printable cards (sample).",
        status: "completed",
        repositoryUrl: "https://example.com/sample/recipe-cards",
        color: "#8b5cf6",
        tasks: [
          { title: "Card template", status: "done", priority: "high", dueInDays: -30, tags: ["design"] },
          { title: "Print margins fix", status: "done", priority: "medium", dueInDays: -24, tags: ["bug"] },
          { title: "Ingredient scaling", status: "done", priority: "low", dueInDays: -20, tags: ["feature"] },
        ],
      },
      {
        name: "Old Blog Theme",
        description: "Retired theme kept for reference (sample).",
        status: "archived",
        color: "#64748b",
        tasks: [
          { title: "Dark mode colors", status: "done", priority: "low", tags: ["css"] },
          { title: "Comment section", status: "backlog", priority: "low", tags: ["feature"] },
          { title: "Faster image loading", status: "todo", priority: "medium", tags: ["performance"] },
          { title: "Tag archive page", status: "in_progress", priority: "low", tags: ["ui"] },
        ],
      },
    ],
  };
}
