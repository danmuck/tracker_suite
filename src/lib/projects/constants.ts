export const PROJECT_STATUSES = ["active", "archived", "completed"] as const;

export const TASK_STATUSES = ["backlog", "todo", "in_progress", "in_review", "done"] as const;

export const TASK_PRIORITIES = ["low", "medium", "high", "urgent"] as const;

export const PROJECT_STATUS_LABELS: Record<string, string> = {
  active: "Active",
  archived: "Archived",
  completed: "Completed",
};

export const TASK_STATUS_LABELS: Record<string, string> = {
  backlog: "Backlog",
  todo: "To Do",
  in_progress: "In Progress",
  in_review: "In Review",
  done: "Done",
};

export const TASK_PRIORITY_LABELS: Record<string, string> = {
  low: "Low",
  medium: "Medium",
  high: "High",
  urgent: "Urgent",
};

export const TASK_PRIORITY_COLORS: Record<string, string> = {
  low: "text-muted-foreground",
  medium: "text-blue-500",
  high: "text-orange-500",
  urgent: "text-red-500",
};

export const TASK_STATUS_COLORS: Record<string, string> = {
  backlog: "border-t-muted-foreground/40",
  todo: "border-t-blue-500/60",
  in_progress: "border-t-yellow-500/60",
  in_review: "border-t-purple-500/60",
  done: "border-t-green-500/60",
};

export const DEFAULT_PROJECT_COLORS = [
  "#3b82f6", // blue
  "#10b981", // emerald
  "#f59e0b", // amber
  "#ef4444", // red
  "#8b5cf6", // violet
  "#ec4899", // pink
  "#06b6d4", // cyan
  "#84cc16", // lime
];
