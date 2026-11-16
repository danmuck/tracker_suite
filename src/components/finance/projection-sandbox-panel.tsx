"use client";

import { useState } from "react";
import { Check, FlaskConical, RotateCcw, Undo2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { SettingsCard } from "@/components/finance/datasheet/settings-card";
import { StepsCard } from "@/components/finance/datasheet/steps-card";
import { applySandboxToRealData } from "@/hooks/finance/apply-sandbox";
import { useFinanceProfile } from "@/hooks/finance/use-finance-profile";
import { useTransactions } from "@/hooks/finance/use-transactions";
import {
  projectionSandbox,
  sandboxChangeCount,
  type SandboxState,
} from "@/hooks/finance/use-projection-sandbox";
import { formatCurrency } from "@/lib/finance/formatters";
import type { FinanceProfileData } from "@/types/finance/datasheet";

function ChangeRow({
  kind,
  label,
  detail,
  undoLabel,
  onUndo,
}: {
  kind: string;
  label: string;
  detail?: string;
  undoLabel: string;
  onUndo: () => void;
}) {
  return (
    <div className="flex items-center gap-3 py-2 text-sm">
      <span className="w-20 shrink-0 text-xs uppercase tracking-wide text-muted-foreground">{kind}</span>
      <span className="min-w-0 flex-1 truncate font-medium">{label}</span>
      {detail && <span className="shrink-0 font-mono text-xs text-muted-foreground">{detail}</span>}
      <Button variant="ghost" size="sm" className="h-7 shrink-0" onClick={onUndo}>
        <Undo2 className="mr-1 h-3.5 w-3.5" />
        {undoLabel}
      </Button>
    </div>
  );
}

/**
 * The sandbox at a glance: every what-if change with its own undo, a simplified
 * Datasheet that only affects the projection, and the buttons to keep the
 * changes (apply to real data) or drop them (reset).
 */
export function ProjectionSandboxPanel({ sandbox }: { sandbox: SandboxState }) {
  const { profile: realProfile } = useFinanceProfile();
  const { transactions } = useTransactions({ limit: 200 });
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [applying, setApplying] = useState(false);

  const count = sandboxChangeCount(sandbox);
  const nameOf = (id: string) => transactions.find((t) => t._id === id)?.description ?? "Transaction";
  const current = sandbox.profile ?? realProfile;
  const salaryTx = transactions.find((t) => t._id === realProfile?.salaryTransactionId);

  function updateProfile(patch: Partial<FinanceProfileData>) {
    if (!current || !realProfile) return;
    const next = { ...current, ...patch };
    // Back to the real values means there is no what-if Datasheet any more
    projectionSandbox.setProfile(JSON.stringify(next) === JSON.stringify(realProfile) ? null : next);
  }

  async function handleApply() {
    setApplying(true);
    try {
      const { applied, error } = await applySandboxToRealData(sandbox);
      if (error) {
        toast.error(
          `${error}. ${applied} ${applied === 1 ? "change was" : "changes were"} applied; the rest are still in the sandbox.`
        );
      } else {
        toast.success(`Applied ${applied} ${applied === 1 ? "change" : "changes"} to your real data`);
      }
    } finally {
      setApplying(false);
      setConfirmOpen(false);
    }
  }

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <FlaskConical className="h-4 w-4 text-primary" />
            Sandbox
          </CardTitle>
          <CardDescription>
            What-if changes used only for this projection. Add, edit or remove transactions on the
            Transactions tab, or change the Datasheet values below. Nothing reaches your real data
            until you apply it.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {count === 0 ? (
            <p className="text-sm text-muted-foreground">
              No changes yet. The projection is showing your real data.
            </p>
          ) : (
            <div className="divide-y divide-border">
              {sandbox.added.map((a) => (
                <ChangeRow
                  key={a.id}
                  kind="Added"
                  label={a.data.description}
                  detail={formatCurrency(Math.round(a.data.amount * 100))}
                  undoLabel="Remove"
                  onUndo={() => projectionSandbox.remove(a.id)}
                />
              ))}
              {Object.entries(sandbox.edited).map(([id, data]) => (
                <ChangeRow
                  key={id}
                  kind="Edited"
                  label={data.description}
                  detail={formatCurrency(Math.round(data.amount * 100))}
                  undoLabel="Undo"
                  onUndo={() => projectionSandbox.restore(id)}
                />
              ))}
              {sandbox.removed.map((id) => (
                <ChangeRow
                  key={id}
                  kind="Removed"
                  label={nameOf(id)}
                  undoLabel="Restore"
                  onUndo={() => projectionSandbox.restore(id)}
                />
              ))}
              {sandbox.profile && (
                <ChangeRow
                  kind="Datasheet"
                  label="Salary, deductions or rent values changed"
                  undoLabel="Undo"
                  onUndo={() => projectionSandbox.setProfile(null)}
                />
              )}
            </div>
          )}

          <div className="flex flex-wrap gap-2">
            <Button disabled={count === 0} onClick={() => setConfirmOpen(true)}>
              <Check className="mr-1.5 h-4 w-4" />
              Apply to real data
            </Button>
            <Button variant="outline" disabled={count === 0} onClick={() => projectionSandbox.clear()}>
              <RotateCcw className="mr-1.5 h-3.5 w-3.5" />
              Reset to real data
            </Button>
          </div>
        </CardContent>
      </Card>

      {current && (
        <>
          <SettingsCard
            profile={current}
            onChange={updateProfile}
            recurring={[]}
            payCycleLabel={
              salaryTx?.recurrenceRule
                ? `${salaryTx.recurrenceRule.frequency.replace("_", "-")} (from ${salaryTx.description})`
                : "Biweekly (no Salary transaction linked)"
            }
            hideLinks
          />
          <StepsCard profile={current} onChange={updateProfile} />
        </>
      )}

      <Dialog open={confirmOpen} onOpenChange={(o) => !applying && setConfirmOpen(o)}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Apply sandbox to real data?</DialogTitle>
            <DialogDescription>
              This writes {count} {count === 1 ? "change" : "changes"} to your real transactions
              {sandbox.profile ? " and Datasheet" : ""}.
            </DialogDescription>
          </DialogHeader>
          <ul className="space-y-1 text-sm">
            {sandbox.added.length > 0 && <li>{sandbox.added.length} added</li>}
            {Object.keys(sandbox.edited).length > 0 && <li>{Object.keys(sandbox.edited).length} edited</li>}
            {sandbox.removed.length > 0 && (
              <li className="text-destructive">
                {sandbox.removed.length} deleted permanently: {sandbox.removed.map(nameOf).join(", ")}
              </li>
            )}
            {sandbox.profile && <li>Datasheet values saved; Salary and Rent amounts updated</li>}
          </ul>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setConfirmOpen(false)} disabled={applying}>
              Cancel
            </Button>
            <Button onClick={handleApply} disabled={applying}>
              {applying ? "Applying…" : "Apply"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
