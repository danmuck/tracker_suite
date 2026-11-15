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
  /** An occurrence of a recurring transaction */
  isRecurring?: boolean;
  /** Totals right after this transaction: bank/cash balance and credit card balance owed (cents) */
  ledger?: { bank: number; credit: number };
  balanceApplied?: boolean;
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
    /** Lowest end-of-day combined cash/bank balance in the window (cents); null when no bank accounts are in view */
    lowestCash: { amount: number; date: string } | null;
    /** Liabilities owing at the start → date first paid off, or null if not within the window */
    payoffDates: Record<string, string | null>;
    /** Projected interest charged in the window (cents) */
    interestCharged: number;
    /** Payments into credit cards and debt in the window (cents) */
    debtPayments: number;
  };
}

export type Granularity = "daily" | "weekly" | "monthly";
