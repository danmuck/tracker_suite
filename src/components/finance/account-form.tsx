"use client";

import { useState } from "react";
import { Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useAccounts } from "@/hooks/finance/use-accounts";
import type { AccountFormData } from "@/types/finance/account";

interface AccountFormProps {
  defaultValues?: Partial<AccountFormData>;
  isCash?: boolean;
  /** APR comes from sub-loans (blended) and can't be typed */
  hasSubLoans?: boolean;
  onSubmit: (data: AccountFormData) => Promise<void>;
  onCancel?: () => void;
}

export function AccountForm({ defaultValues, isCash, hasSubLoans, onSubmit, onCancel }: AccountFormProps) {
  const [loading, setLoading] = useState(false);
  const [name, setName] = useState(defaultValues?.name ?? "");
  const [type, setType] = useState<AccountFormData["type"]>(
    defaultValues?.type ?? "bank"
  );
  const [balance, setBalance] = useState(String(defaultValues?.balance ?? "0"));
  const [creditLimit, setCreditLimit] = useState(
    String(defaultValues?.creditLimit ?? "")
  );
  const [isLoan, setIsLoan] = useState(defaultValues?.isLoan ?? false);
  const [linkedAccountId, setLinkedAccountId] = useState(
    defaultValues?.linkedAccountId ?? ""
  );
  const [depositFunds, setDepositFunds] = useState(false);
  const isCreate = !defaultValues;
  const [apr, setApr] = useState(defaultValues?.apr != null ? String(defaultValues.apr) : "");
  const [minimumPayment, setMinimumPayment] = useState(
    defaultValues?.minimumPayment != null ? String(defaultValues.minimumPayment) : ""
  );
  const [currency, setCurrency] = useState(defaultValues?.currency ?? "USD");
  const [notes, setNotes] = useState(defaultValues?.notes ?? "");
  const [errors, setErrors] = useState<Record<string, string>>({});

  const { accounts: bankAccounts } = useAccounts("bank");

  function validate(): boolean {
    const errs: Record<string, string> = {};
    if (!name.trim()) errs.name = "Name is required";
    if (isNaN(Number(balance))) errs.balance = "Balance must be a number";
    if (apr && (isNaN(Number(apr)) || Number(apr) < 0 || Number(apr) > 100)) {
      errs.apr = "APR must be between 0 and 100";
    }
    if (minimumPayment && (isNaN(Number(minimumPayment)) || Number(minimumPayment) < 0)) {
      errs.minimumPayment = "Minimum payment must be a positive number";
    }
    if (type === "credit_card" && creditLimit && isNaN(Number(creditLimit))) {
      errs.creditLimit = "Credit limit must be a number";
    }
    setErrors(errs);
    return Object.keys(errs).length === 0;
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!validate()) return;
    setLoading(true);
    try {
      const data: AccountFormData = {
        name: name.trim(),
        type,
        balance: Number(balance),
        currency,
        notes: notes || undefined,
        ...(type === "credit_card" && creditLimit
          ? { creditLimit: Number(creditLimit) }
          : {}),
        ...(type === "credit_card" || type === "debt"
          ? {
              ...(hasSubLoans ? {} : { apr: apr === "" ? null : Number(apr) }),
              minimumPayment: minimumPayment === "" ? null : Number(minimumPayment),
            }
          : {}),
        ...(type === "debt"
          ? {
              isLoan,
              ...(isLoan && linkedAccountId ? { linkedAccountId } : {}),
              ...(isCreate && isLoan && linkedAccountId && depositFunds
                ? { depositFunds: true }
                : {}),
            }
          : {}),
      };
      await onSubmit(data);
    } finally {
      setLoading(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <div className="space-y-1">
        <Label htmlFor="name">Account Name</Label>
        <Input
          id="name"
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="e.g. Chase Checking"
        />
        {errors.name && <p className="text-xs text-destructive">{errors.name}</p>}
      </div>

      {!isCash && (
        <div className="space-y-1">
          <Label htmlFor="type">Account Type</Label>
          <Select value={type} onValueChange={(v) => setType(v as AccountFormData["type"])}>
            <SelectTrigger id="type">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="bank">Bank</SelectItem>
              <SelectItem value="credit_card">Credit Card</SelectItem>
              <SelectItem value="debt">Debt</SelectItem>
            </SelectContent>
          </Select>
        </div>
      )}

      <div className="space-y-1">
        <Label htmlFor="balance">
          {type === "credit_card" ? "Current Balance (owed)" : "Balance"} ($)
        </Label>
        <Input
          id="balance"
          type="number"
          step="0.01"
          value={balance}
          onChange={(e) => setBalance(e.target.value)}
          placeholder="0.00"
        />
        {errors.balance && (
          <p className="text-xs text-destructive">{errors.balance}</p>
        )}
      </div>

      {type === "credit_card" && (
        <div className="space-y-1">
          <Label htmlFor="creditLimit">Credit Limit ($)</Label>
          <Input
            id="creditLimit"
            type="number"
            step="0.01"
            value={creditLimit}
            onChange={(e) => setCreditLimit(e.target.value)}
            placeholder="e.g. 5000"
          />
          {errors.creditLimit && (
            <p className="text-xs text-destructive">{errors.creditLimit}</p>
          )}
        </div>
      )}

      {(type === "credit_card" || type === "debt") && (
        <div className="grid grid-cols-2 gap-3">
          <div className="space-y-1">
            <Label htmlFor="apr">APR (%)</Label>
            <Input
              id="apr"
              type="number"
              step="0.01"
              min="0"
              value={hasSubLoans ? "" : apr}
              onChange={(e) => setApr(e.target.value)}
              placeholder={hasSubLoans ? "Blended from sub-loans" : "Optional, e.g. 6.5"}
              disabled={hasSubLoans}
            />
            {errors.apr && <p className="text-xs text-destructive">{errors.apr}</p>}
          </div>
          <div className="space-y-1">
            <Label htmlFor="minimumPayment">Minimum payment ($/mo)</Label>
            <Input
              id="minimumPayment"
              type="number"
              step="0.01"
              min="0"
              value={minimumPayment}
              onChange={(e) => setMinimumPayment(e.target.value)}
              placeholder="Optional"
            />
            {errors.minimumPayment && <p className="text-xs text-destructive">{errors.minimumPayment}</p>}
          </div>
        </div>
      )}

      {type === "debt" && (
        <>
          <div className="flex items-center gap-2">
            <Switch
              id="isLoan"
              checked={isLoan}
              onCheckedChange={setIsLoan}
            />
            <Label htmlFor="isLoan">This is a loan (linked to a bank account)</Label>
          </div>

          {isLoan && (
            <div className="space-y-1">
              <Label htmlFor="linkedAccountId">Linked Bank Account</Label>
              <Select
                value={linkedAccountId}
                onValueChange={setLinkedAccountId}
              >
                <SelectTrigger id="linkedAccountId">
                  <SelectValue placeholder="Select bank account" />
                </SelectTrigger>
                <SelectContent>
                  {bankAccounts.map((a) => (
                    <SelectItem key={a._id} value={a._id}>
                      {a.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}

          {isCreate && isLoan && linkedAccountId && (
            <div className="space-y-1">
              <div className="flex items-center gap-2">
                <Switch
                  id="depositFunds"
                  checked={depositFunds}
                  onCheckedChange={setDepositFunds}
                />
                <Label htmlFor="depositFunds">Deposit the loan amount into this bank account</Label>
              </div>
              <p className="text-xs text-muted-foreground">
                Turn on for a new loan paying out now. Leave off for a loan you already have.
              </p>
            </div>
          )}
        </>
      )}

      <div className="space-y-1">
        <Label htmlFor="currency">Currency</Label>
        <Input
          id="currency"
          value={currency}
          onChange={(e) => setCurrency(e.target.value.toUpperCase())}
          placeholder="USD"
          maxLength={3}
        />
      </div>

      <div className="space-y-1">
        <Label htmlFor="notes">Notes</Label>
        <Textarea
          id="notes"
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          placeholder="Optional notes..."
          rows={3}
        />
      </div>

      <div className="flex gap-2 justify-end">
        {onCancel && (
          <Button type="button" variant="outline" onClick={onCancel} disabled={loading}>
            Cancel
          </Button>
        )}
        <Button type="submit" disabled={loading}>
          {loading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
          Save
        </Button>
      </div>
    </form>
  );
}
