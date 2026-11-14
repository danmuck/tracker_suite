"use client";

import { useState } from "react";
import { format } from "date-fns";
import { CalendarIcon } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Calendar } from "@/components/ui/calendar";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { setupPayments } from "@/hooks/finance/use-payment-plan";
import type { Account } from "@/types/finance/account";

interface Props {
  account: Account;
  banks: Account[];
  minimumPayment: number | null; // dollars
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function SetupPaymentsDialog({ account, banks, minimumPayment, open, onOpenChange }: Props) {
  const [fromAccountId, setFromAccountId] = useState(account.linkedAccountId ?? banks[0]?._id ?? "");
  const [startDate, setStartDate] = useState<Date>(new Date());
  const [dayOfMonth, setDayOfMonth] = useState(String(Math.min(new Date().getDate(), 28)));
  const [amount, setAmount] = useState(minimumPayment != null ? String(minimumPayment) : "");
  const [saving, setSaving] = useState(false);

  const day = Number(dayOfMonth);
  const valid = !!fromAccountId && day >= 1 && day <= 28 && amount !== "" && Number(amount) >= 0;

  async function submit() {
    if (!valid) return;
    setSaving(true);
    try {
      await setupPayments(account._id, {
        fromAccountId,
        dayOfMonth: day,
        startDate: format(startDate, "yyyy-MM-dd"),
        firstAmount: Number(amount),
      });
      toast.success(`Payments set up for ${account.name}`);
      onOpenChange(false);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to set up payments");
    } finally {
      setSaving(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={(o) => !saving && onOpenChange(o)}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Set up payments · {account.name}</DialogTitle>
          <DialogDescription>
            Creates a monthly transfer into {account.name}. Change the amount over time from its payment timeline.
          </DialogDescription>
        </DialogHeader>
        <div className="grid gap-3 sm:grid-cols-2">
          <div className="space-y-1 sm:col-span-2">
            <Label htmlFor="pay-from">Pay from</Label>
            <Select value={fromAccountId} onValueChange={setFromAccountId}>
              <SelectTrigger id="pay-from" className="w-full">
                <SelectValue placeholder="Choose a bank account" />
              </SelectTrigger>
              <SelectContent>
                {banks.map((b) => (
                  <SelectItem key={b._id} value={b._id}>
                    {b.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1">
            <Label>First payment</Label>
            <Popover>
              <PopoverTrigger asChild>
                <Button variant="outline" className="w-full justify-start font-normal">
                  <CalendarIcon className="mr-2 h-4 w-4" />
                  {format(startDate, "MMM d, yyyy")}
                </Button>
              </PopoverTrigger>
              <PopoverContent className="w-auto p-0" align="start">
                <Calendar
                  mode="single"
                  selected={startDate}
                  defaultMonth={startDate}
                  onSelect={(d) => {
                    if (!d) return;
                    setStartDate(d);
                    setDayOfMonth(String(Math.min(d.getDate(), 28)));
                  }}
                />
              </PopoverContent>
            </Popover>
          </div>
          <div className="space-y-1">
            <Label htmlFor="pay-day">Day of month</Label>
            <Input id="pay-day" type="number" min={1} max={28} value={dayOfMonth} onChange={(e) => setDayOfMonth(e.target.value)} />
          </div>
          <div className="space-y-1 sm:col-span-2">
            <Label htmlFor="pay-amount">Monthly payment ($)</Label>
            <Input
              id="pay-amount"
              type="number"
              step="0.01"
              min="0"
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              placeholder={minimumPayment != null ? `Minimum ${minimumPayment}` : "0.00"}
            />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={saving}>
            Cancel
          </Button>
          <Button onClick={submit} disabled={!valid || saving}>
            {saving ? "Setting up…" : "Set up payments"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
