"use client";

import { useState } from "react";
import { toast } from "sonner";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { usePaymentPlan, updatePaymentPlan, type RapSettings } from "@/hooks/finance/use-payment-plan";
import type { Account } from "@/types/finance/account";

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const DEFAULT_RAP: RapSettings = { enabled: false, autoSchedule: true, recertDate: "07-01", dependents: 0 };

/** Federal Repayment Assistance Plan settings for a loan. */
export function RapSection({ account }: { account: Account }) {
  const { plan } = usePaymentPlan(account._id);
  const [busy, setBusy] = useState(false);
  const [dependentsDraft, setDependentsDraft] = useState<string | null>(null);
  if (!plan) return null;

  const rap = plan.rap ?? DEFAULT_RAP;
  const [month, day] = rap.recertDate.split("-");

  async function save(patch: Partial<RapSettings>) {
    setBusy(true);
    try {
      await updatePaymentPlan(account._id, { rap: { ...rap, ...patch } });
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to update RAP settings");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-2 text-sm">
      <div className="flex items-center justify-between gap-2">
        <Label htmlFor={`rap-${account._id}`} className="text-xs font-normal">
          RAP: waive unpaid interest + $50 principal match
        </Label>
        <Switch id={`rap-${account._id}`} checked={rap.enabled} disabled={busy} onCheckedChange={(v) => save({ enabled: v })} />
      </div>
      {rap.enabled && (
        <>
          <div className="flex items-center justify-between gap-2">
            <Label htmlFor={`rap-auto-${account._id}`} className="text-xs font-normal">
              Update payment at recertification from prior-year income
            </Label>
            <Switch
              id={`rap-auto-${account._id}`}
              checked={rap.autoSchedule}
              disabled={busy}
              onCheckedChange={(v) => save({ autoSchedule: v })}
            />
          </div>
          <div className="flex flex-wrap items-center gap-2 text-xs">
            <span className="text-muted-foreground">Recertifies</span>
            <Select value={month} onValueChange={(m) => save({ recertDate: `${m}-${day}` })} disabled={busy}>
              <SelectTrigger className="h-7 w-20 text-xs">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {MONTHS.map((label, i) => (
                  <SelectItem key={label} value={String(i + 1).padStart(2, "0")}>
                    {label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Select value={day} onValueChange={(d) => save({ recertDate: `${month}-${d}` })} disabled={busy}>
              <SelectTrigger className="h-7 w-16 text-xs">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {Array.from({ length: 28 }, (_, i) => String(i + 1).padStart(2, "0")).map((d) => (
                  <SelectItem key={d} value={d}>
                    {Number(d)}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <span className="ml-2 text-muted-foreground">Dependents</span>
            <Input
              type="number"
              min={0}
              max={20}
              className="h-7 w-14 px-2 text-xs"
              value={dependentsDraft ?? String(rap.dependents)}
              onChange={(e) => setDependentsDraft(e.target.value)}
              onBlur={() => {
                const n = Number(dependentsDraft);
                if (dependentsDraft !== null && Number.isInteger(n) && n >= 0 && n !== rap.dependents) save({ dependents: n });
                setDependentsDraft(null);
              }}
              disabled={busy}
            />
          </div>
        </>
      )}
    </div>
  );
}
