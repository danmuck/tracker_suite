export type TransactionType = "credit" | "debit" | "transfer";

export type RecurrenceFrequency =
  | "daily"
  | "weekly"
  | "biweekly"
  | "monthly"
  | "semi_monthly"
  | "annually"
  | "custom";

export interface RecurrenceRule {
  frequency: RecurrenceFrequency;
  interval?: number;
  startDate: string;
  endDate?: string | null;
  dayOfWeek?: number; // 0-6
  dayOfMonth?: number; // 1-31
  daysOfMonth?: number[]; // for semi_monthly, e.g. [1, 15]
}

export interface Transaction {
  _id: string;
  amount: number; // cents
  date: string;
  description: string;
  accountId: string;
  toAccountId?: string;
  type: TransactionType;
  isRecurring: boolean;
  recurrenceRule?: RecurrenceRule;
  categoryTags: string[];
  notes?: string;
  createdAt: string;
  updatedAt: string;
}

export interface TransactionFormData {
  amount: number; // dollars for form input
  date: string;
  description: string;
  accountId: string;
  toAccountId?: string;
  type: TransactionType;
  isRecurring: boolean;
  recurrenceRule?: RecurrenceRule;
  categoryTags: string[];
  notes?: string;
}
