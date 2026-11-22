"use client";

import { useState } from "react";
import { Plus, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { formatCurrency } from "@/lib/finance/formatters";
import { hourlyToAnnual, salaryRow, tenYearRows } from "@/lib/finance/datasheet";
import type { FinanceProfileData, SalaryRow } from "@/types/finance/datasheet";

interface Props {
  profile: FinanceProfileData;
  onChange: (patch: Partial<FinanceProfileData>) => void;
  actualGross: number | null; // cents, salary in effect today
  today: string;
  periodsPerYear: number;
}

const COLS: { key: keyof SalaryRow; label: string; net?: boolean }[] = [
  { key: "hourly", label: "Hourly" },
  { key: "weeklyGross", label: "Weekly (g)" },
  { key: "monthlyGross", label: "Monthly (g)" },
  { key: "annualGross", label: "Annually (g)" },
  { key: "weeklyNet", label: "Weekly (net)", net: true },
  { key: "monthlyNet", label: "Monthly (net)", net: true },
  { key: "annualNet", label: "Annually (net)", net: true },
];

function Cells({ row }: { row: SalaryRow }) {
  return (
    <>
      {COLS.map(({ key, net }) => (
        <TableCell
          key={key}
          className={`text-right tabular-nums ${net ? "text-emerald-700 dark:text-emerald-500" : ""}`}
        >
          {formatCurrency(row[key])}
        </TableCell>
      ))}
    </>
  );
}

/** Editable what-if salary: type hourly or annual dollars. */
function WhatIfInput({ annualGross, hoursPerWeek, onCommit }: { annualGross: number; hoursPerWeek: number; onCommit: (cents: number) => void }) {
  const [text, setText] = useState(String(annualGross / 100));
  const [per, setPer] = useState<"yr" | "hr">("yr");
  function commit(t = text, p = per) {
    const n = Number(t);
    if (isNaN(n) || n < 0) return;
    const cents = Math.round(n * 100);
    onCommit(p === "hr" ? hourlyToAnnual(cents, hoursPerWeek) : cents);
  }
  return (
    <div className="flex items-center gap-1">
      <Input
        type="number"
        min="0"
        step="0.01"
        className="h-7 w-24 px-2 text-right"
        value={text}
        onChange={(e) => setText(e.target.value)}
        onBlur={() => commit()}
        onKeyDown={(e) => e.key === "Enter" && commit()}
        aria-label="What-if salary"
      />
      <button
        type="button"
        className="rounded border px-1.5 text-xs text-muted-foreground hover:bg-muted"
        onClick={() => {
          const next = per === "yr" ? "hr" : "yr";
          setPer(next);
          commit(text, next);
        }}
        title="Toggle per year / per hour"
      >
        /{per}
      </button>
    </div>
  );
}

export function SalaryTable({ profile, onChange, actualGross, today, periodsPerYear }: Props) {
  const rowFor = (gross: number) => salaryRow(gross, profile, today, periodsPerYear);
  const projection = actualGross !== null ? tenYearRows(actualGross, profile, today, periodsPerYear) : [];
  const whatIfs = profile.whatIfSalaries;
  const setWhatIfs = (next: FinanceProfileData["whatIfSalaries"]) => onChange({ whatIfSalaries: next });

  return (
    <Card>
      <CardHeader className="flex flex-row items-start justify-between gap-4">
        <div className="space-y-1.5">
          <CardTitle className="text-base">Salaries</CardTitle>
          <CardDescription>
            (g) = gross, (net) = take-home after 401(k), health and taxes. Hourly uses {profile.hoursPerWeek} h/week.
          </CardDescription>
        </div>
        <div className="flex items-center gap-2 text-sm">
          <label htmlFor="raise" className="whitespace-nowrap text-muted-foreground">
            Raise per year
          </label>
          <Input
            id="raise"
            type="number"
            min="0"
            max="50"
            step="0.1"
            className="h-8 w-20 text-right"
            value={+(profile.raiseRate * 100).toFixed(2)}
            onChange={(e) => onChange({ raiseRate: Math.min(0.5, Math.max(0, Number(e.target.value) / 100 || 0)) })}
          />
          <span className="text-muted-foreground">%</span>
        </div>
      </CardHeader>
      <CardContent className="overflow-x-auto">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="w-40" />
              {COLS.map((c) => (
                <TableHead key={c.key} className="text-right">
                  {c.label}
                </TableHead>
              ))}
              <TableHead className="w-8" />
            </TableRow>
          </TableHeader>
          <TableBody>
            <TableRow className="font-medium">
              <TableCell>Actual</TableCell>
              {actualGross !== null ? (
                <Cells row={rowFor(actualGross)} />
              ) : (
                <TableCell colSpan={COLS.length} className="text-muted-foreground">
                  Add a salary under Changes over time
                </TableCell>
              )}
              <TableCell />
            </TableRow>

            {whatIfs.map((w, i) => (
              <TableRow key={i}>
                <TableCell>
                  <WhatIfInput
                    annualGross={w.annualGross}
                    hoursPerWeek={profile.hoursPerWeek}
                    onCommit={(cents) => setWhatIfs(whatIfs.map((x, j) => (j === i ? { ...x, annualGross: cents } : x)))}
                  />
                </TableCell>
                <Cells row={rowFor(w.annualGross)} />
                <TableCell>
                  <button
                    type="button"
                    aria-label="Remove what-if salary"
                    className="text-muted-foreground hover:text-destructive"
                    onClick={() => setWhatIfs(whatIfs.filter((_, j) => j !== i))}
                  >
                    <X className="h-4 w-4" />
                  </button>
                </TableCell>
              </TableRow>
            ))}
            <TableRow className="hover:bg-transparent">
              <TableCell colSpan={COLS.length + 2}>
                <Button
                  variant="ghost"
                  size="sm"
                  className="h-7 gap-1 px-2 text-muted-foreground"
                  onClick={() => setWhatIfs([...whatIfs, { annualGross: actualGross ?? 5_000_000 }])}
                >
                  <Plus className="h-3.5 w-3.5" /> What-if salary
                </Button>
              </TableCell>
            </TableRow>

            {projection.map((row, k) => (
              <TableRow key={`y${k}`} className={k === 0 ? "border-t-2" : undefined}>
                <TableCell className="text-muted-foreground">{k === 0 ? "Starting" : `Year ${k}`}</TableCell>
                <Cells row={row} />
                <TableCell />
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </CardContent>
    </Card>
  );
}
