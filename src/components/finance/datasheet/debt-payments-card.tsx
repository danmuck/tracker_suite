"use client";

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { PaymentPlanPanel } from "@/components/finance/debt/payment-plan-panel";
import { useAccounts } from "@/hooks/finance/use-accounts";
import { formatCurrency } from "@/lib/finance/formatters";

/** Every active credit card and debt account's payment timeline, editable here or on its account card. */
export function DebtPaymentsCard() {
  const { accounts } = useAccounts();
  const active = accounts.filter((a) => !a.isArchived);
  const debts = active.filter((a) => a.type === "credit_card" || a.type === "debt");
  const banks = active.filter((a) => a.type === "bank");
  if (debts.length === 0) return null;

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Debt payments</CardTitle>
        <CardDescription>Changes here save immediately and match each account&apos;s card.</CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {debts.map((a) => (
          <div key={a._id} className="grid gap-2 border-b pb-4 last:border-0 last:pb-0 sm:grid-cols-[10rem_1fr]">
            <div>
              <p className="text-sm font-medium">{a.name}</p>
              <p className="text-xs text-muted-foreground">
                {a.type === "credit_card" ? "Credit card" : "Debt"} · {formatCurrency(a.balance)} owed
              </p>
            </div>
            <PaymentPlanPanel account={a} banks={banks} />
          </div>
        ))}
      </CardContent>
    </Card>
  );
}
