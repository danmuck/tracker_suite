"use client";

import { useMemo, useState } from "react";
import { Save, Undo2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { PageHeader } from "@/components/page-header";
import { LoadingState } from "@/components/loading-state";
import { SettingsCard } from "@/components/finance/datasheet/settings-card";
import { StepsCard } from "@/components/finance/datasheet/steps-card";
import { PaycheckBreakdown } from "@/components/finance/datasheet/paycheck-breakdown";
import { SalaryTable } from "@/components/finance/datasheet/salary-table";
import { RentMergeBanner } from "@/components/finance/datasheet/rent-merge-banner";
import { useFinanceProfile, saveFinanceProfile, mergeRent } from "@/hooks/finance/use-finance-profile";
import { useTransactions } from "@/hooks/finance/use-transactions";
import { localTodayStr } from "@/lib/finance/dates";
import { paycheckOn, stepOn } from "@/lib/finance/datasheet";
import { getPeriodsPerYear } from "@/lib/finance/tax-calculator";
import { formatDate } from "@/lib/finance/formatters";
import type { FinanceProfileData } from "@/types/finance/datasheet";

const CYCLE_LABELS: Record<string, string> = {
  weekly: "Weekly",
  biweekly: "Biweekly",
  semi_monthly: "Semi-monthly",
  monthly: "Monthly",
};

export default function DatasheetPage() {
  const { profile, isLoading, mutate } = useFinanceProfile();
  const { transactions: recurring, mutate: mutateTransactions } = useTransactions({ isRecurring: true, limit: 200 });
  // Unsaved edits; null means "showing what's saved"
  const [draft, setDraft] = useState<FinanceProfileData | null>(null);
  const [saving, setSaving] = useState(false);

  const current = draft ?? profile;
  const today = localTodayStr();

  const salaryTx = recurring.find((t) => t._id === current?.salaryTransactionId);
  const frequency = salaryTx?.recurrenceRule?.frequency ?? "biweekly";
  const periodsPerYear = getPeriodsPerYear(frequency);

  const { actualGross, asOf } = useMemo(() => {
    if (!current || current.salarySteps.length === 0) return { actualGross: null, asOf: today };
    const inEffect = stepOn(current.salarySteps, today);
    if (inEffect) return { actualGross: inEffect.annualGross, asOf: today };
    // All salary changes are in the future: show the earliest one
    const first = [...current.salarySteps].sort((a, b) => a.effectiveDate.localeCompare(b.effectiveDate))[0];
    return { actualGross: first.annualGross, asOf: first.effectiveDate };
  }, [current, today]);

  // A second recurring debit with the same name as the linked Rent → offer to merge it
  const rentTx = recurring.find((t) => t._id === current?.rentTransactionId);
  const duplicateRent = rentTx
    ? recurring.find((t) => t._id !== rentTx._id && t.type === "debit" && t.description.trim().toLowerCase() === rentTx.description.trim().toLowerCase())
    : undefined;

  if (isLoading || !current) return <LoadingState />;

  const update = (patch: Partial<FinanceProfileData>) => setDraft({ ...current, ...patch });

  async function handleSave() {
    if (!current) return;
    setSaving(true);
    try {
      const { updated } = await saveFinanceProfile(current);
      await Promise.all([mutate(), mutateTransactions()]);
      setDraft(null);
      const parts = [updated.salary && "Salary", updated.rent && "Rent"].filter(Boolean);
      toast.success(parts.length ? `Saved · ${parts.join(" and ")} updated` : "Saved");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to save");
    } finally {
      setSaving(false);
    }
  }

  async function handleMerge() {
    if (!rentTx || !duplicateRent) return;
    try {
      await mergeRent(rentTx._id, duplicateRent._id);
      await Promise.all([mutate(), mutateTransactions()]);
      toast.success("Rent merged");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to merge rent");
    }
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title="Datasheet"
        description="Salary, deductions and rent that drive your Salary and Rent transactions"
        action={
          <div className="flex gap-2">
            {draft && (
              <Button variant="ghost" onClick={() => setDraft(null)} disabled={saving}>
                <Undo2 className="mr-1 h-4 w-4" /> Discard
              </Button>
            )}
            <Button onClick={handleSave} disabled={!draft || saving}>
              <Save className="mr-1 h-4 w-4" /> {saving ? "Saving…" : "Save"}
            </Button>
          </div>
        }
      />

      {rentTx && duplicateRent && !draft && (
        <RentMergeBanner keep={rentTx} merge={duplicateRent} onConfirm={handleMerge} />
      )}

      <SettingsCard
        profile={current}
        onChange={update}
        recurring={recurring}
        payCycleLabel={salaryTx ? `${CYCLE_LABELS[frequency] ?? frequency} (from ${salaryTx.description})` : "Biweekly (link a Salary transaction)"}
      />

      <StepsCard profile={current} onChange={update} />

      {actualGross !== null && (
        <PaycheckBreakdown
          breakdown={paycheckOn(actualGross, current, asOf, periodsPerYear)}
          asOf={asOf === today ? "today" : `from ${formatDate(asOf)}`}
        />
      )}

      <SalaryTable
        profile={current}
        onChange={update}
        actualGross={actualGross}
        today={asOf}
        periodsPerYear={periodsPerYear}
      />
    </div>
  );
}
