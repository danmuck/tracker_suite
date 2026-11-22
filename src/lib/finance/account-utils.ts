import { Wallet, CreditCard, TrendingDown, type LucideIcon } from "lucide-react";
import { ACCOUNT_TYPES } from "@/lib/finance/constants";
import type { Account, AccountType } from "@/types/finance/account";

export const accountTypeLabels: Record<AccountType, string> = {
  bank: "Bank",
  credit_card: "Credit Card",
  debt: "Debt",
};

export const accountTypeGroupLabels: Record<AccountType, string> = {
  bank: "Bank Accounts",
  credit_card: "Credit Cards",
  debt: "Debt",
};

export const accountTypeIcons: Record<AccountType, LucideIcon> = {
  bank: Wallet,
  credit_card: CreditCard,
  debt: TrendingDown,
};

export function accountTypeLabel(account: Account): string {
  if (account.isCash) return "Cash";
  return accountTypeLabels[account.type] ?? account.type;
}

export function isLiability(account: Pick<Account, "type">): boolean {
  return account.type === "credit_card" || account.type === "debt";
}

/** Cash first, then bank → credit_card → debt, then largest balance first. */
export function sortAccounts(accounts: Account[]): Account[] {
  return [...accounts].sort((a, b) => {
    if (!!a.isCash !== !!b.isCash) return a.isCash ? -1 : 1;
    const typeDiff = ACCOUNT_TYPES.indexOf(a.type) - ACCOUNT_TYPES.indexOf(b.type);
    if (typeDiff !== 0) return typeDiff;
    return b.balance - a.balance;
  });
}

export interface AccountTotals {
  /** Sum of bank balances (cents) */
  assets: number;
  /** Sum of credit card + debt balances (cents) */
  liabilities: number;
  netWorth: number;
  creditBalance: number;
  creditLimit: number;
  /** Percent, or null when no credit limit is set */
  creditUtilization: number | null;
}

export function computeAccountTotals(accounts: Account[]): AccountTotals {
  let assets = 0;
  let liabilities = 0;
  let creditBalance = 0;
  let creditLimit = 0;

  for (const a of accounts) {
    if (a.type === "bank") {
      assets += a.balance;
    } else {
      liabilities += a.balance;
    }
    if (a.type === "credit_card") {
      creditBalance += a.balance;
      creditLimit += a.creditLimit ?? 0;
    }
  }

  return {
    assets,
    liabilities,
    netWorth: assets - liabilities,
    creditBalance,
    creditLimit,
    creditUtilization: creditLimit > 0 ? (creditBalance / creditLimit) * 100 : null,
  };
}
