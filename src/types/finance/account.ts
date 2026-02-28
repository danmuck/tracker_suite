export type AccountType = "bank" | "credit_card" | "debt";

export interface Account {
  _id: string;
  name: string;
  type: AccountType;
  balance: number; // cents
  creditLimit?: number; // cents, credit_card only
  isLoan?: boolean; // debt only
  linkedAccountId?: string; // ref to bank account for loan disbursement
  currency: string;
  notes?: string;
  isCash?: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface AccountFormData {
  name: string;
  type: AccountType;
  balance: number; // dollars for form input
  creditLimit?: number;
  isLoan?: boolean;
  linkedAccountId?: string;
  currency?: string;
  notes?: string;
}
