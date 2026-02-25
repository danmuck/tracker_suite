export interface ProjectedTransaction {
  date: string;
  amount: number; // cents
  description: string;
  accountId: string;
  type: "credit" | "debit";
  categoryTags: string[];
  isProjected: boolean;
  sourceTransactionId?: string;
}

export interface ProjectionDay {
  date: string;
  balances: Record<string, number>; // accountId -> balance in cents
  transactions: ProjectedTransaction[];
}

export interface ProjectionResult {
  timeline: ProjectionDay[];
  summary: {
    totalIncome: number;
    totalExpenses: number;
    netChange: number;
    startBalances: Record<string, number>;
    endBalances: Record<string, number>;
  };
}

export type Granularity = "daily" | "weekly" | "monthly";
