export interface ProjectedTransaction {
  date: string;
  amount: number; // cents
  originalAmount?: number; // cents — set when amount was reduced due to balance constraints
  description: string;
  accountId: string;
  type: "credit" | "debit" | "transfer";
  toAccountId?: string;
  categoryTags: string[];
  isProjected: boolean;
  sourceTransactionId?: string;
}

export type ProjectionAlertReason =
  | "credit_limit"
  | "debt_paid_off"
  | "insufficient_balance";

export interface ProjectionAlert {
  date: string;
  description: string;
  accountId: string;
  toAccountId?: string;
  originalAmount: number; // cents
  adjustedAmount: number; // cents
  reason: ProjectionAlertReason;
  sourceTransactionId?: string;
}

export interface ProjectionDay {
  date: string;
  balances: Record<string, number>; // accountId -> balance in cents
  transactions: ProjectedTransaction[];
}

export interface ProjectionResult {
  timeline: ProjectionDay[];
  alerts: ProjectionAlert[];
  summary: {
    totalIncome: number;
    totalExpenses: number;
    netChange: number;
    startBalances: Record<string, number>;
    endBalances: Record<string, number>;
  };
}

export type Granularity = "daily" | "weekly" | "monthly";
