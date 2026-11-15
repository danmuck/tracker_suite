"use client";

import { useState } from "react";
import { AlertTriangle, CalendarClock, Unlink } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Skeleton } from "@/components/ui/skeleton";
import { ScheduleEditor } from "@/components/finance/schedule-editor";
import { SetupPaymentsDialog } from "@/components/finance/debt/setup-payments-dialog";
import { usePaymentPlan, updatePaymentPlan, unlinkPaymentPlan, type PaymentPlan } from "@/hooks/finance/use-payment-plan";
import { formatCurrency, formatDate, formatMonth } from "@/lib/finance/formatters";
import { localTodayStr } from "@/lib/finance/dates";
import { amountOn } from "@/lib/finance/amount-schedule";
import type { Account } from "@/types/finance/account";

function ordinal(n: number) {
  const s = ["th", "st", "nd", "rd"];
  const v = n % 100;
  return n + (s[(v - 20) % 10] || s[v] || s[0]);
}

function rateLine(plan: PaymentPlan) {
  const parts: string[] = [];
  if (plan.blendedApr != null) parts.push(`APR ${plan.blendedApr}% (blended)`);
  else if (plan.apr != null) parts.push(`APR ${plan.apr}%`);
  if (plan.minimumPayment != null) parts.push(`Min ${formatCurrency(plan.minimumPayment * 100)}/mo`);
  return parts.join(" · ");
}

/** Payment timeline for a credit card or debt account: payoff, source, schedule chips, setup. */
export function PaymentPlanPanel({ account, banks }: { account: Account; banks: Account[] }) {
  const { plan, isLoading } = usePaymentPlan(account._id);
  const [setupOpen, setSetupOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [confirmUnlink, setConfirmUnlink] = useState(false);

  if (isLoading || !plan) return <Skeleton className="h-16 w-full" />;

  const manual = plan.schedule.filter((e) => !e.source);
  const minCents = plan.minimumPayment != null ? Math.round(plan.minimumPayment * 100) : null;
  const scheduleCents = plan.schedule.map((e) => ({ ...e, amount: Math.round(e.amount * 100) }));
  const currentCents = scheduleCents.length ? amountOn(scheduleCents[0].amount, scheduleCents, localTodayStr()) : null;
  const belowMin = minCents != null && scheduleCents.some((e) => e.amount < minCents);

  async function save(next: { effectiveDate: string; amount: number }[]) {
    setBusy(true);
    try {
      await updatePaymentPlan(account._id, { schedule: next });
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to update payments");
    } finally {
      setBusy(false);
    }
  }

  async function unlink() {
    setBusy(true);
    try {
      await unlinkPaymentPlan(account._id);
      setConfirmUnlink(false);
      toast.success(`Payment plan removed for ${account.name}`);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to unlink");
    } finally {
      setBusy(false);
    }
  }

  const rates = rateLine(plan);

  return (
    <div className="space-y-2 text-sm">
      {rates && <p className="text-xs text-muted-foreground">{rates}</p>}

      {!plan.payment ? (
        <>
          <Button size="sm" variant="outline" className="h-7" onClick={() => setSetupOpen(true)} disabled={banks.length === 0}>
            <CalendarClock className="mr-1 h-3.5 w-3.5" /> Set up payments
          </Button>
          {banks.length === 0 && <p className="text-xs text-muted-foreground">Add a bank account to pay from first.</p>}
          {setupOpen && (
            <SetupPaymentsDialog
              account={account}
              banks={banks}
              minimumPayment={plan.minimumPayment}
              open={setupOpen}
              onOpenChange={setSetupOpen}
            />
          )}
        </>
      ) : (
        <>
          <div className="flex items-center justify-between gap-2 text-xs text-muted-foreground">
            <span>
              {plan.payment.fromAccountName} → {account.name}
              {plan.payment.frequency === "monthly" && plan.payment.dayOfMonth
                ? `, monthly on the ${ordinal(plan.payment.dayOfMonth)}`
                : `, ${plan.payment.frequency}`}
              {currentCents != null && ` · now ${formatCurrency(currentCents)}`}
            </span>
            <button
              type="button"
              className="inline-flex items-center gap-1 hover:text-destructive disabled:opacity-50"
              onClick={() => setConfirmUnlink(true)}
              disabled={busy}
              title="Remove this payment plan and its transfer"
            >
              <Unlink className="h-3 w-3" /> Unlink
            </button>
          </div>

          <Dialog open={confirmUnlink} onOpenChange={(o) => !busy && setConfirmUnlink(o)}>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>Unlink payment plan?</DialogTitle>
                <DialogDescription>
                  Deletes the &ldquo;{plan.payment.fromAccountName} → {account.name}&rdquo; payment transfer and its
                  timeline. Payments already posted stay in both balances. This can&apos;t be undone.
                </DialogDescription>
              </DialogHeader>
              <DialogFooter>
                <Button variant="outline" onClick={() => setConfirmUnlink(false)} disabled={busy}>
                  Cancel
                </Button>
                <Button variant="destructive" onClick={unlink} disabled={busy}>
                  Unlink and delete
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>

          {plan.payoff && (
            <p className="text-xs">
              {plan.payoff.payoffDate ? (
                <>
                  Paid off ~<span className="font-medium">{formatMonth(plan.payoff.payoffDate)}</span>
                  {plan.payoff.totalInterest > 0 && <> · interest ~{formatCurrency(plan.payoff.totalInterest)}</>}
                </>
              ) : (
                <span className="text-amber-600 dark:text-amber-400">Not paid off at current payments</span>
              )}
            </p>
          )}

          <ScheduleEditor
            entries={scheduleCents.map((e) => ({ effectiveDate: e.effectiveDate, value: e.amount, source: e.source }))}
            valueMode="money"
            unit="/mo"
            disabled={busy}
            warnBelow={minCents}
            emptyLabel="No payments scheduled"
            onAdd={(effectiveDate, cents) => save([...manual, { effectiveDate, amount: cents / 100 }])}
            onRemove={(date) => save(manual.filter((e) => e.effectiveDate !== date))}
          />

          {belowMin && (
            <p className="flex items-center gap-1 text-xs text-amber-600 dark:text-amber-400">
              <AlertTriangle className="h-3 w-3" /> Some payments are below the {formatCurrency(minCents!)} minimum
            </p>
          )}
          {plan.nextRap && plan.rap?.autoSchedule && (
            <p className="text-xs text-muted-foreground">
              Next RAP: {formatDate(plan.nextRap.effectiveDate)} · {formatCurrency(plan.nextRap.amount * 100)}/mo from{" "}
              {plan.nextRap.incomeYear} income {formatCurrency(plan.nextRap.agi * 100)}
            </p>
          )}
        </>
      )}
    </div>
  );
}
