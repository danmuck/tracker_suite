import { formatCurrency } from "@/lib/formatters";
import { cn } from "@/lib/utils";

interface CurrencyDisplayProps {
  cents: number;
  currency?: string;
  colored?: boolean;
  className?: string;
}

export function CurrencyDisplay({
  cents,
  currency = "USD",
  colored = false,
  className,
}: CurrencyDisplayProps) {
  return (
    <span
      className={cn(
        colored && cents > 0 && "text-green-600 dark:text-green-400",
        colored && cents < 0 && "text-red-600 dark:text-red-400",
        className
      )}
    >
      {formatCurrency(cents, currency)}
    </span>
  );
}
