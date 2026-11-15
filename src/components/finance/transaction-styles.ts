import type { Transaction } from "@/types/finance/transaction";

// Account names are coloured by the direction money moves for that account
export const MONEY_IN = "text-green-600 dark:text-green-400";
export const MONEY_OUT = "text-red-600 dark:text-red-400";

// Subtle per-type row tint, with a matching type badge
export const TYPE_STYLE: Record<Transaction["type"], { row: string; badge: string }> = {
  credit: {
    row: "bg-green-500/[0.04] hover:bg-green-500/10",
    badge: "border-green-500/30 bg-green-500/10 text-green-700 dark:text-green-400",
  },
  debit: {
    row: "bg-red-500/[0.04] hover:bg-red-500/10",
    badge: "border-red-500/30 bg-red-500/10 text-red-700 dark:text-red-400",
  },
  transfer: {
    row: "bg-blue-500/[0.04] hover:bg-blue-500/10",
    badge: "border-blue-500/30 bg-blue-500/10 text-blue-700 dark:text-blue-400",
  },
};
