import type { Account } from "@/types/account";

/** Bank balances minus credit card and debt balances, in cents. */
export function netWorth(accounts: Account[]): number {
  return accounts.reduce(
    (total, account) =>
      account.type === "bank" ? total + account.balance : total - account.balance,
    0
  );
}
