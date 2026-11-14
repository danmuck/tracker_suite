"use client";

import { useState } from "react";
import { Plus, X } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { usePaymentPlan, updatePaymentPlan } from "@/hooks/finance/use-payment-plan";
import { formatCurrency } from "@/lib/finance/formatters";
import type { Account } from "@/types/finance/account";

/** Sub-loans under one total balance; their balance-weighted rate is the account's APR. */
export function LoansSection({ account }: { account: Account }) {
  const { plan } = usePaymentPlan(account._id);
  const [name, setName] = useState("");
  const [balance, setBalance] = useState("");
  const [rate, setRate] = useState("");
  const [busy, setBusy] = useState(false);
  if (!plan) return null;

  const loans = plan.subLoans;
  const totalCents = Math.round(loans.reduce((s, l) => s + l.balance, 0) * 100);
  const valid = name.trim() !== "" && balance !== "" && Number(balance) >= 0 && rate !== "" && Number(rate) >= 0 && Number(rate) <= 100;

  async function save(next: typeof loans) {
    setBusy(true);
    try {
      await updatePaymentPlan(account._id, { subLoans: next });
      return true;
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to update loans");
      return false;
    } finally {
      setBusy(false);
    }
  }

  async function add() {
    if (!valid) return;
    if (await save([...loans, { name: name.trim(), balance: Number(balance), apr: Number(rate) }])) {
      setName("");
      setBalance("");
      setRate("");
    }
  }

  return (
    <div className="space-y-2 text-sm">
      {loans.length > 0 && (
        <ul className="space-y-1">
          {loans.map((l, i) => (
            <li key={`${l.name}-${i}`} className="flex items-center justify-between gap-2 text-xs">
              <span className="truncate">{l.name}</span>
              <span className="flex items-center gap-2 tabular-nums text-muted-foreground">
                {formatCurrency(l.balance * 100)} · {l.apr}%
                <button
                  type="button"
                  aria-label={`Remove ${l.name}`}
                  className="hover:text-destructive disabled:opacity-50"
                  disabled={busy}
                  onClick={() => save(loans.filter((_, j) => j !== i))}
                >
                  <X className="h-3 w-3" />
                </button>
              </span>
            </li>
          ))}
        </ul>
      )}
      {loans.length > 0 && (
        <p className="text-xs text-muted-foreground">
          Blended {plan.blendedApr}% · sub-loans total {formatCurrency(totalCents)}
          {totalCents !== account.balance && (
            <span className="text-amber-600 dark:text-amber-400"> (balance is {formatCurrency(account.balance)})</span>
          )}
        </p>
      )}
      <div className="flex items-center gap-1">
        <Input className="h-7 min-w-0 flex-1 px-2 text-xs" placeholder="Loan name" value={name} onChange={(e) => setName(e.target.value)} />
        <Input className="h-7 w-20 px-2 text-xs" type="number" min="0" step="0.01" placeholder="Balance" value={balance} onChange={(e) => setBalance(e.target.value)} />
        <Input className="h-7 w-14 px-2 text-xs" type="number" min="0" step="0.01" placeholder="%" value={rate} onChange={(e) => setRate(e.target.value)} onKeyDown={(e) => e.key === "Enter" && add()} />
        <Button size="sm" variant="outline" className="h-7 px-2" onClick={add} disabled={!valid || busy} aria-label="Add sub-loan">
          <Plus className="h-3.5 w-3.5" />
        </Button>
      </div>
    </div>
  );
}
