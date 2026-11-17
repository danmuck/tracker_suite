import type { DaySummary } from "../../types/finance/summary";
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

export interface ExpenseItem {
  key: string;
  /** yyyy-MM-dd */
  date: string;
  description: string;
  /** Cents */
  amount: number;
  category?: string;
}

export interface MonthExpenses {
  /** Dated today or earlier, latest first */
  paid: ExpenseItem[];
  /** Dated after today, soonest first */
  upcoming: ExpenseItem[];
  /** Cents */
  paidTotal: number;
  upcomingTotal: number;
}

type ExpenseDay = { date: string; transactions: Pick<DaySummary["transactions"][number], "type" | "amount" | "description" | "categoryTags">[] };

/** A month's expense lines (debits only; transfers are not spending), split at `today` (yyyy-MM-dd) */
export function monthExpenses(days: ExpenseDay[], today: string): MonthExpenses {
  const items = days
    .flatMap((d) =>
      d.transactions
        .filter((t) => t.type === "debit")
        .map((t, i) => ({
          key: `${d.date}-${i}-${t.description}`,
          date: d.date.slice(0, 10),
          description: t.description,
          amount: t.amount,
          category: t.categoryTags[0],
        }))
    )
    .sort((a, b) => a.date.localeCompare(b.date));
  const paid = items.filter((i) => i.date <= today).reverse();
  const upcoming = items.filter((i) => i.date > today);
  const sum = (list: ExpenseItem[]) => list.reduce((n, i) => n + i.amount, 0);
  return { paid, upcoming, paidTotal: sum(paid), upcomingTotal: sum(upcoming) };
}
