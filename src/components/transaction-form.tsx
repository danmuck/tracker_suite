"use client";

import { useState } from "react";
import { format } from "date-fns";
import { CalendarIcon, Loader2, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { Checkbox } from "@/components/ui/checkbox";
import { Calendar } from "@/components/ui/calendar";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { CategoryBadge } from "@/components/category-badge";
import { useAccounts } from "@/hooks/use-accounts";
import { useCategories } from "@/hooks/use-categories";
import { formatDateISO, parseDate } from "@/lib/formatters";
import type { TransactionFormData, RecurrenceFrequency } from "@/types/transaction";

interface TransactionFormProps {
  defaultValues?: Partial<TransactionFormData>;
  onSubmit: (data: TransactionFormData) => Promise<void>;
  onCancel?: () => void;
}

export function TransactionForm({
  defaultValues,
  onSubmit,
  onCancel,
}: TransactionFormProps) {
  const [loading, setLoading] = useState(false);
  const [description, setDescription] = useState(defaultValues?.description ?? "");
  const [amount, setAmount] = useState(String(defaultValues?.amount ?? ""));
  const [date, setDate] = useState<Date>(
    defaultValues?.date ? parseDate(defaultValues.date) : new Date()
  );
  const [accountId, setAccountId] = useState(defaultValues?.accountId ?? "");
  const [toAccountId, setToAccountId] = useState(defaultValues?.toAccountId ?? "");
  const [type, setType] = useState<"credit" | "debit" | "transfer">(
    defaultValues?.type ?? "debit"
  );
  const [categoryTags, setCategoryTags] = useState<string[]>(
    defaultValues?.categoryTags ?? []
  );
  const [isRecurring, setIsRecurring] = useState(
    defaultValues?.isRecurring ?? false
  );
  const [frequency, setFrequency] = useState<RecurrenceFrequency>(
    defaultValues?.recurrenceRule?.frequency ?? "monthly"
  );
  const [recEndDate, setRecEndDate] = useState<Date | undefined>(
    defaultValues?.recurrenceRule?.endDate
      ? parseDate(defaultValues.recurrenceRule.endDate)
      : undefined
  );
  const [dayOfWeek, setDayOfWeek] = useState(
    String(defaultValues?.recurrenceRule?.dayOfWeek ?? "5")
  );
  const [dayOfMonth, setDayOfMonth] = useState(
    String(defaultValues?.recurrenceRule?.dayOfMonth ?? (defaultValues?.date ? parseDate(defaultValues.date).getDate() : new Date().getDate()))
  );
  const [daysOfMonth1, setDaysOfMonth1] = useState(
    String(defaultValues?.recurrenceRule?.daysOfMonth?.[0] ?? "1")
  );
  const [daysOfMonth2, setDaysOfMonth2] = useState(
    String(defaultValues?.recurrenceRule?.daysOfMonth?.[1] ?? "15")
  );
  const [interval, setInterval] = useState(
    String(defaultValues?.recurrenceRule?.interval ?? "1")
  );
  const [notes, setNotes] = useState(defaultValues?.notes ?? "");
  const [errors, setErrors] = useState<Record<string, string>>({});

  const { accounts } = useAccounts();
  const { categories } = useCategories();

  function toggleCategory(name: string) {
    setCategoryTags((prev) =>
      prev.includes(name) ? prev.filter((c) => c !== name) : [...prev, name]
    );
  }

  function validate(): boolean {
    const errs: Record<string, string> = {};
    if (!description.trim()) errs.description = "Description is required";
    if (!amount || isNaN(Number(amount)) || Number(amount) <= 0)
      errs.amount = "Amount must be a positive number";
    if (!accountId) errs.accountId = "Account is required";
    if (type === "transfer") {
      if (!toAccountId) errs.toAccountId = "Destination account is required";
      else if (toAccountId === accountId) errs.toAccountId = "Cannot transfer to the same account";
    }
    setErrors(errs);
    return Object.keys(errs).length === 0;
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!validate()) return;
    setLoading(true);
    try {
      const finalCategoryTags = type === "transfer" && !categoryTags.includes("transfer")
        ? [...categoryTags, "transfer"]
        : categoryTags;
      const data: TransactionFormData = {
        description: description.trim(),
        amount: Number(amount),
        date: formatDateISO(date),
        accountId,
        ...(type === "transfer" ? { toAccountId } : {}),
        type,
        categoryTags: finalCategoryTags,
        isRecurring,
        notes: notes || undefined,
        ...(isRecurring
          ? {
              recurrenceRule: {
                frequency,
                startDate: formatDateISO(date),
                endDate: recEndDate ? formatDateISO(recEndDate) : null,
                ...(frequency === "weekly" || frequency === "biweekly"
                  ? { dayOfWeek: Number(dayOfWeek) }
                  : {}),
                ...(frequency === "monthly"
                  ? { dayOfMonth: Number(dayOfMonth) }
                  : {}),
                ...(frequency === "semi_monthly"
                  ? {
                      daysOfMonth: [
                        Number(daysOfMonth1),
                        Number(daysOfMonth2),
                      ],
                    }
                  : {}),
                ...(frequency === "custom" || frequency === "daily"
                  ? { interval: Number(interval) }
                  : {}),
              },
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
        <Label htmlFor="description">Description</Label>
        <Input
          id="description"
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          placeholder="e.g. Grocery run"
        />
        {errors.description && (
          <p className="text-xs text-destructive">{errors.description}</p>
        )}
      </div>

      <div className="grid grid-cols-2 gap-3">
        <div className="space-y-1">
          <Label htmlFor="amount">Amount ($)</Label>
          <Input
            id="amount"
            type="number"
            step="0.01"
            min="0.01"
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
            placeholder="0.00"
          />
          {errors.amount && (
            <p className="text-xs text-destructive">{errors.amount}</p>
          )}
        </div>

        <div className="space-y-1">
          <Label>Date</Label>
          <Popover>
            <PopoverTrigger asChild>
              <Button variant="outline" className="w-full justify-start text-left font-normal">
                <CalendarIcon className="mr-2 h-4 w-4" />
                {format(date, "MMM d, yyyy")}
              </Button>
            </PopoverTrigger>
            <PopoverContent className="w-auto p-0" align="start">
              <Calendar
                mode="single"
                selected={date}
                onSelect={(d) => {
                  if (d) {
                    setDate(d);
                    setDayOfMonth(String(d.getDate()));
                  }
                }}
                initialFocus
              />
            </PopoverContent>
          </Popover>
        </div>
      </div>

      <div className="space-y-1">
        <Label htmlFor="accountId">{type === "transfer" ? "From Account" : "Account"}</Label>
        <Select value={accountId} onValueChange={setAccountId}>
          <SelectTrigger id="accountId">
            <SelectValue placeholder="Select account" />
          </SelectTrigger>
          <SelectContent>
            {accounts.map((a) => (
              <SelectItem key={a._id} value={a._id}>
                {a.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        {errors.accountId && (
          <p className="text-xs text-destructive">{errors.accountId}</p>
        )}
      </div>

      {type === "transfer" && (
        <div className="space-y-1">
          <Label htmlFor="toAccountId">To Account</Label>
          <Select value={toAccountId} onValueChange={setToAccountId}>
            <SelectTrigger id="toAccountId">
              <SelectValue placeholder="Select destination account" />
            </SelectTrigger>
            <SelectContent>
              {accounts
                .filter((a) => a._id !== accountId)
                .map((a) => (
                  <SelectItem key={a._id} value={a._id}>
                    {a.name}
                  </SelectItem>
                ))}
            </SelectContent>
          </Select>
          {errors.toAccountId && (
            <p className="text-xs text-destructive">{errors.toAccountId}</p>
          )}
        </div>
      )}

      <div className="space-y-1">
        <Label>Type</Label>
        <Tabs value={type} onValueChange={(v) => setType(v as "credit" | "debit" | "transfer")}>
          <TabsList className="w-full">
            <TabsTrigger value="credit" className="flex-1">
              Income
            </TabsTrigger>
            <TabsTrigger value="debit" className="flex-1">
              Expense
            </TabsTrigger>
            <TabsTrigger value="transfer" className="flex-1">
              Transfer
            </TabsTrigger>
          </TabsList>
        </Tabs>
      </div>

      <div className="space-y-2">
        <Label>Categories</Label>
        <Popover>
          <PopoverTrigger asChild>
            <Button variant="outline" className="w-full justify-start h-auto min-h-9 py-1.5 flex-wrap gap-1">
              {categoryTags.length === 0 ? (
                <span className="text-muted-foreground text-sm">Select categories...</span>
              ) : (
                categoryTags.map((tag) => (
                  <CategoryBadge key={tag} categoryName={tag} categories={categories} />
                ))
              )}
            </Button>
          </PopoverTrigger>
          <PopoverContent
            className="p-2 max-h-72 overflow-y-auto"
            style={{ width: "var(--radix-popover-trigger-width)" }}
            side="bottom"
            align="start"
          >
            <div className="grid grid-cols-2 gap-1">
              {categories.map((cat) => (
                <div
                  key={cat._id}
                  className="flex items-center gap-2 rounded px-2 py-1.5 hover:bg-muted cursor-pointer"
                  onClick={() => toggleCategory(cat.name)}
                >
                  <Checkbox
                    checked={categoryTags.includes(cat.name)}
                    onCheckedChange={() => toggleCategory(cat.name)}
                  />
                  <CategoryBadge categoryName={cat.name} categories={categories} />
                </div>
              ))}
            </div>
          </PopoverContent>
        </Popover>
        {categoryTags.length > 0 && (
          <Button
            type="button"
            variant="ghost"
            size="sm"
            className="h-6 text-xs"
            onClick={() => setCategoryTags([])}
          >
            <X className="mr-1 h-3 w-3" />
            Clear
          </Button>
        )}
      </div>

      <div className="flex items-center gap-2">
        <Switch
          id="isRecurring"
          checked={isRecurring}
          onCheckedChange={setIsRecurring}
        />
        <Label htmlFor="isRecurring">Recurring transaction</Label>
      </div>

      {isRecurring && (
        <div className="rounded-md border p-4 space-y-4">
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1">
              <Label>Frequency</Label>
              <Select
                value={frequency}
                onValueChange={(v) => setFrequency(v as RecurrenceFrequency)}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="daily">Daily</SelectItem>
                  <SelectItem value="weekly">Weekly</SelectItem>
                  <SelectItem value="biweekly">Biweekly</SelectItem>
                  <SelectItem value="monthly">Monthly</SelectItem>
                  <SelectItem value="semi_monthly">Semi-Monthly</SelectItem>
                  <SelectItem value="annually">Annually</SelectItem>
                  <SelectItem value="custom">Custom</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-1">
              <Label>End Date (optional)</Label>
              <Popover>
                <PopoverTrigger asChild>
                  <Button variant="outline" className="w-full justify-start font-normal">
                    <CalendarIcon className="mr-2 h-4 w-4" />
                    {recEndDate ? format(recEndDate, "MMM d, yyyy") : "No end"}
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="w-auto p-0" align="start">
                  <Calendar
                    mode="single"
                    selected={recEndDate}
                    onSelect={(d) => setRecEndDate(d)}
                    initialFocus
                  />
                </PopoverContent>
              </Popover>
            </div>
          </div>

          {(frequency === "weekly" || frequency === "biweekly") && (
            <div className="space-y-1">
              <Label>Day of Week</Label>
              <Select value={dayOfWeek} onValueChange={setDayOfWeek}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"].map(
                    (d, i) => (
                      <SelectItem key={i} value={String(i)}>
                        {d}
                      </SelectItem>
                    )
                  )}
                </SelectContent>
              </Select>
            </div>
          )}

          {frequency === "monthly" && (
            <div className="space-y-1">
              <Label>Day of Month</Label>
              <Input
                type="number"
                min="1"
                max="31"
                value={dayOfMonth}
                onChange={(e) => setDayOfMonth(e.target.value)}
              />
            </div>
          )}

          {frequency === "semi_monthly" && (
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1">
                <Label>First Day</Label>
                <Input
                  type="number"
                  min="1"
                  max="31"
                  value={daysOfMonth1}
                  onChange={(e) => setDaysOfMonth1(e.target.value)}
                />
              </div>
              <div className="space-y-1">
                <Label>Second Day</Label>
                <Input
                  type="number"
                  min="1"
                  max="31"
                  value={daysOfMonth2}
                  onChange={(e) => setDaysOfMonth2(e.target.value)}
                />
              </div>
            </div>
          )}

          {(frequency === "custom" || frequency === "daily") && (
            <div className="space-y-1">
              <Label>Every N Days</Label>
              <Input
                type="number"
                min="1"
                value={interval}
                onChange={(e) => setInterval(e.target.value)}
              />
            </div>
          )}
        </div>
      )}

      <div className="space-y-1">
        <Label htmlFor="notes">Notes</Label>
        <Textarea
          id="notes"
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          placeholder="Optional notes..."
          rows={2}
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
