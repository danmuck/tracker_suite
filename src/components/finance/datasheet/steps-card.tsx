"use client";

import { useState } from "react";
import { format } from "date-fns";
import { CalendarIcon, Plus, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Calendar } from "@/components/ui/calendar";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { formatCurrency, formatDate, parseDate } from "@/lib/finance/formatters";
import { hourlyToAnnual } from "@/lib/finance/datasheet";
import type { FinanceProfileData } from "@/types/finance/datasheet";

type Kind = "salary" | "retirement" | "health" | "rent";

const KINDS: { kind: Kind; key: keyof FinanceProfileData; label: string; field: string; unit: string }[] = [
  { kind: "salary", key: "salarySteps", label: "Salary", field: "annualGross", unit: "/yr" },
  { kind: "retirement", key: "retirementSteps", label: "401(k)", field: "percent", unit: "" },
  { kind: "health", key: "healthSteps", label: "Health", field: "perPaycheck", unit: "/check" },
  { kind: "rent", key: "rentSteps", label: "Rent", field: "monthly", unit: "/mo" },
];

type Step = { effectiveDate: string } & Record<string, number | string>;

function display(kind: Kind, value: number) {
  return kind === "retirement" ? `${+(value * 100).toFixed(2)}%` : formatCurrency(value);
}

function AddStep({
  kind,
  hoursPerWeek,
  existingDates,
  onAdd,
}: {
  kind: Kind;
  hoursPerWeek: number;
  existingDates: string[];
  onAdd: (date: string, value: number) => void;
}) {
  const [open, setOpen] = useState(false);
  const [date, setDate] = useState<Date>(new Date());
  const [value, setValue] = useState("");
  const [per, setPer] = useState<"year" | "hour">("year");
  const dateStr = format(date, "yyyy-MM-dd");
  const duplicate = existingDates.includes(dateStr);
  const num = Number(value);
  const valid = value !== "" && !isNaN(num) && num >= 0 && !(kind === "retirement" && num > 100);

  function submit() {
    if (!valid || duplicate) return;
    const cents = Math.round(num * 100);
    const stored =
      kind === "retirement" ? num / 100 : kind === "salary" && per === "hour" ? hourlyToAnnual(cents, hoursPerWeek) : cents;
    onAdd(dateStr, stored);
    setValue("");
    setOpen(false);
  }

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button variant="outline" size="sm" className="h-7 gap-1 px-2">
          <Plus className="h-3.5 w-3.5" /> Add
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-auto space-y-3 p-3" align="start">
        <Calendar mode="single" selected={date} defaultMonth={date} onSelect={(d) => d && setDate(d)} />
        <div className="flex items-center gap-2">
          <span className="text-sm text-muted-foreground">{kind === "retirement" ? "%" : "$"}</span>
          <Input
            autoFocus
            type="number"
            step="0.01"
            min="0"
            className="h-8 w-32"
            value={value}
            onChange={(e) => setValue(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && submit()}
            placeholder={kind === "retirement" ? "6" : "0.00"}
          />
          {kind === "salary" && (
            <Select value={per} onValueChange={(v) => setPer(v as "year" | "hour")}>
              <SelectTrigger className="h-8 w-28">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="year">per year</SelectItem>
                <SelectItem value="hour">per hour</SelectItem>
              </SelectContent>
            </Select>
          )}
        </div>
        {duplicate && <p className="text-xs text-destructive">There is already a change on this date.</p>}
        <Button size="sm" className="w-full" disabled={!valid || duplicate} onClick={submit}>
          <CalendarIcon className="mr-1 h-3.5 w-3.5" /> Add from {formatDate(dateStr)}
        </Button>
      </PopoverContent>
    </Popover>
  );
}

export function StepsCard({
  profile,
  onChange,
}: {
  profile: FinanceProfileData;
  onChange: (patch: Partial<FinanceProfileData>) => void;
}) {
  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Changes over time</CardTitle>
        <CardDescription>
          Each change applies to the first paycheck or rent payment on or after its date.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-3">
        {KINDS.map(({ kind, key, label, field, unit }) => {
          const steps = [...(profile[key] as unknown as Step[])].sort((a, b) =>
            a.effectiveDate.localeCompare(b.effectiveDate)
          );
          return (
            <div key={kind} className="flex flex-wrap items-center gap-2 border-b pb-3 last:border-0 last:pb-0">
              <span className="w-16 text-sm font-medium">{label}</span>
              {steps.length === 0 && <span className="text-sm text-muted-foreground">None</span>}
              {steps.map((s) => (
                <span
                  key={s.effectiveDate}
                  className="inline-flex items-center gap-1.5 rounded-md border bg-muted/40 px-2 py-0.5 text-sm"
                >
                  <span className="text-muted-foreground">{format(parseDate(s.effectiveDate), "MMM d, yyyy")}</span>
                  <span className="font-medium tabular-nums">
                    {display(kind, s[field] as number)}
                    <span className="text-muted-foreground">{unit}</span>
                  </span>
                  <button
                    type="button"
                    aria-label={`Remove ${label} change on ${s.effectiveDate}`}
                    className="text-muted-foreground hover:text-destructive"
                    onClick={() =>
                      onChange({ [key]: steps.filter((x) => x.effectiveDate !== s.effectiveDate) } as Partial<FinanceProfileData>)
                    }
                  >
                    <X className="h-3.5 w-3.5" />
                  </button>
                </span>
              ))}
              <AddStep
                kind={kind}
                hoursPerWeek={profile.hoursPerWeek}
                existingDates={steps.map((s) => s.effectiveDate)}
                onAdd={(effectiveDate, value) =>
                  onChange({ [key]: [...steps, { effectiveDate, [field]: value }] } as Partial<FinanceProfileData>)
                }
              />
            </div>
          );
        })}
      </CardContent>
    </Card>
  );
}
