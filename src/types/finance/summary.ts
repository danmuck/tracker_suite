import { ProjectedTransaction } from "./projection";

export type SummaryView = "weekly" | "monthly" | "annual";

export interface DaySummary {
  date: string;
  transactions: ProjectedTransaction[];
  balances: Record<string, number>;
  totalCredits: number;
  totalDebits: number;
}

export interface MonthSummary {
  month: number; // 0-11
  year: number;
  label: string;
  totalCredits: number;
  totalDebits: number;
  transactionCount: number;
  balances: Record<string, number>;
}

export interface SummaryResult {
  view: SummaryView;
  period: {
    start: string;
    end: string;
    label: string;
  };
  days?: DaySummary[];
  months?: MonthSummary[];
  totals: {
    income: number;
    expenses: number;
    net: number;
  };
  categoryBreakdown: Array<{
    category: string;
    amount: number;
    percentage: number;
  }>;
}
