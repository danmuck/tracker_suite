"use client";

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { formatCurrency } from "@/lib/finance/formatters";
import { cn } from "@/lib/utils";
import type { PaycheckBreakdown as Breakdown, PaycheckLines } from "@/lib/finance/tax-calculator";

const LINES: { key: keyof PaycheckLines; label: string }[] = [
  { key: "retirement", label: "401(k)" },
  { key: "health", label: "Health insurance" },
  { key: "federal", label: "Federal income tax" },
  { key: "socialSecurity", label: "Social Security" },
  { key: "medicare", label: "Medicare" },
  { key: "nyState", label: "NY State income tax" },
  { key: "nyc", label: "NYC income tax" },
  { key: "sdi", label: "NY disability (SDI)" },
  { key: "pfl", label: "NY paid family leave" },
];

export function PaycheckBreakdown({ breakdown, asOf }: { breakdown: Breakdown; asOf: string }) {
  const { annual, perPeriod } = breakdown;
  const cols = [
    (k: keyof PaycheckLines) => perPeriod[k],
    (k: keyof PaycheckLines) => Math.round(annual[k] / 12),
    (k: keyof PaycheckLines) => annual[k],
  ];
  const row = (key: keyof PaycheckLines, label: string, className?: string, sign = "") => (
    <TableRow key={key} className={className}>
      <TableCell>{label}</TableCell>
      {cols.map((col, i) => (
        <TableCell key={i} className="text-right tabular-nums">
          {sign}
          {formatCurrency(col(key))}
        </TableCell>
      ))}
    </TableRow>
  );

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Paycheck breakdown</CardTitle>
        <CardDescription>
          In effect {asOf} · effective tax rate {(breakdown.effectiveTaxRate * 100).toFixed(1)}%
        </CardDescription>
      </CardHeader>
      <CardContent>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead />
              <TableHead className="text-right">Per paycheck</TableHead>
              <TableHead className="text-right">Monthly</TableHead>
              <TableHead className="text-right">Annual</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {row("gross", "Gross pay", "font-medium")}
            {LINES.filter(({ key }) => annual[key] !== 0).map(({ key, label }) =>
              row(key, label, "text-muted-foreground", "−")
            )}
            {row("net", "Take-home pay", cn("font-semibold text-emerald-700 dark:text-emerald-500"))}
          </TableBody>
        </Table>
      </CardContent>
    </Card>
  );
}
