"use client";

import { useState } from "react";
import { GitMerge, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { formatCurrency, formatDate } from "@/lib/finance/formatters";
import type { Transaction } from "@/types/finance/transaction";

interface Props {
  keep: Transaction;
  extra: Transaction;
  onMerge: () => Promise<void>;
  onDelete: () => Promise<void>;
}

type Action = "merge" | "delete";

export function RentMergeBanner({ keep, extra, onMerge, onDelete }: Props) {
  const [pending, setPending] = useState<Action | null>(null);
  const [busy, setBusy] = useState(false);
  const date = extra.recurrenceRule?.startDate ?? extra.date;
  const when = formatDate(date);

  const copy: Record<Action, { title: string; body: string; confirm: string }> = {
    merge: {
      title: "Merge rent transactions?",
      body: `Adds a rent change of ${formatCurrency(extra.amount)} on ${when}, extends the first ${keep.description} so it keeps going, and deletes the extra transaction. This can't be undone.`,
      confirm: "Merge",
    },
    delete: {
      title: "Delete the extra transaction?",
      body: `Deletes the ${extra.description} transaction starting ${when} (${formatCurrency(extra.amount)}). Your linked ${keep.description} and its rent changes are left as they are. This can't be undone.`,
      confirm: "Delete",
    },
  };

  async function confirm() {
    if (!pending) return;
    setBusy(true);
    try {
      await (pending === "merge" ? onMerge() : onDelete());
      setPending(null);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-amber-500/40 bg-amber-500/10 px-4 py-3 text-sm">
      <p>
        You have an extra <strong>{extra.description}</strong> transaction starting {when} at{" "}
        {formatCurrency(extra.amount)}. Merge it into {keep.description} as a change on that date, or delete it?
      </p>
      <div className="flex gap-2">
        <Button size="sm" variant="outline" onClick={() => setPending("merge")}>
          <GitMerge className="mr-1 h-4 w-4" /> Merge
        </Button>
        <Button size="sm" variant="outline" className="text-destructive" onClick={() => setPending("delete")}>
          <Trash2 className="mr-1 h-4 w-4" /> Delete
        </Button>
      </div>
      <Dialog open={pending !== null} onOpenChange={(o) => !o && !busy && setPending(null)}>
        <DialogContent>
          {pending && (
            <>
              <DialogHeader>
                <DialogTitle>{copy[pending].title}</DialogTitle>
                <DialogDescription>{copy[pending].body}</DialogDescription>
              </DialogHeader>
              <DialogFooter>
                <Button variant="outline" onClick={() => setPending(null)} disabled={busy}>
                  Cancel
                </Button>
                <Button variant={pending === "delete" ? "destructive" : "default"} disabled={busy} onClick={confirm}>
                  {copy[pending].confirm}
                </Button>
              </DialogFooter>
            </>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
