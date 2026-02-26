import { formatCurrency } from "@/lib/formatters";
import { cn } from "@/lib/utils";

interface CurrencyDisplayProps {
  cents: number;
  currency?: string;
  /** Legacy: green for positive, red for negative */
  colored?: boolean;
  /** Account-type-aware coloring (overrides `colored`) */
  accountType?: "bank" | "credit_card" | "debt";
  /** In cents; used with accountType="credit_card" to determine at/over-limit state */
  creditLimit?: number;
  className?: string;
}

function accountBalanceColor(
  accountType: string,
  cents: number,
  creditLimit?: number
): string {
  if (accountType === "bank") {
    if (cents > 0) return "text-green-600 dark:text-green-400";
    if (cents < 0) return "text-red-600 dark:text-red-400";
    return "";
  }
  if (accountType === "credit_card") {
    const atOrOverLimit = creditLimit != null && cents >= creditLimit;
    return atOrOverLimit
      ? "text-red-600 dark:text-red-400"
      : "text-blue-600 dark:text-blue-400";
  }
  if (accountType === "debt") {
    return "text-red-600 dark:text-red-400";
  }
  return "";
}

export function CurrencyDisplay({
  cents,
  currency = "USD",
  colored = false,
  accountType,
  creditLimit,
  className,
}: CurrencyDisplayProps) {
  const colorClass = accountType
    ? accountBalanceColor(accountType, cents, creditLimit)
    : colored
    ? cents > 0
      ? "text-green-600 dark:text-green-400"
      : cents < 0
      ? "text-red-600 dark:text-red-400"
      : ""
    : "";

  return (
    <span className={cn(colorClass, className)}>
      {formatCurrency(cents, currency)}
    </span>
  );
}
