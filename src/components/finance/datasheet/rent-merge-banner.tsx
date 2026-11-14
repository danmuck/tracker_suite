"use client";

import { useState } from "react";
import { GitMerge } from "lucide-react";
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
  merge: Transaction;
  onConfirm: () => Promise<void>;
}

export function RentMergeBanner({ keep, merge, onConfirm }: Props) {
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const date = merge.recurrenceRule?.startDate ?? merge.date;

  return (
    <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-amber-500/40 bg-amber-500/10 px-4 py-3 text-sm">
      <p>
        You have a second <strong>{merge.description}</strong> transaction starting {formatDate(date)} at{" "}
        {formatCurrency(merge.amount)}. Merge it into one {keep.description} with a change on that date?
      </p>
      <Button size="sm" variant="outline" onClick={() => setOpen(true)}>
        <GitMerge className="mr-1 h-4 w-4" /> Merge
      </Button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Merge rent transactions?</DialogTitle>
            <DialogDescription>
              Adds a rent change of {formatCurrency(merge.amount)} on {formatDate(date)}, extends the first{" "}
              {keep.description} so it keeps going, and deletes the second transaction. This can&apos;t be undone.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setOpen(false)} disabled={busy}>
              Cancel
            </Button>
            <Button
              disabled={busy}
              onClick={async () => {
                setBusy(true);
                try {
                  await onConfirm();
                  setOpen(false);
                } finally {
                  setBusy(false);
                }
              }}
            >
              Merge
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
