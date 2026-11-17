"use client";

import Link from "next/link";
import { Bar, BarChart, XAxis } from "recharts";
import { ChartContainer, ChartTooltip, ChartTooltipContent, type ChartConfig } from "@/components/ui/chart";

export interface SparkSeries {
  key: string;
  label: string;
  color: string;
  format?: (value: number) => string;
}

/**
 * Axis-free mini bar chart. Rows need a `label` (shown in the tooltip) plus one number per series.
 * Several series sit side by side, or on top of each other when `stacked`.
 */
export function SparkBars<T extends { label: string }>({
  data,
  series,
  stacked = false,
}: {
  data: T[];
  series: SparkSeries[];
  stacked?: boolean;
}) {
  const config: ChartConfig = Object.fromEntries(series.map((s) => [s.key, { label: s.label, color: s.color }]));
  const byKey = new Map(series.map((s) => [s.key, s]));
  return (
    <ChartContainer config={config} className="aspect-auto h-[72px] w-full border-b">
      <BarChart data={data} margin={{ left: 0, right: 0, top: 4, bottom: 0 }} barGap={2}>
        <XAxis dataKey="label" hide />
        <ChartTooltip
          cursor={{ fillOpacity: 0.3 }}
          content={
            <ChartTooltipContent
              formatter={(value, name) => {
                const s = byKey.get(String(name));
                return (
                  <div className="flex w-full items-center justify-between gap-4">
                    <span className="flex items-center gap-1.5 text-muted-foreground">
                      <span className="h-2 w-2 rounded-[2px]" style={{ backgroundColor: s?.color }} />
                      {s?.label ?? name}
                    </span>
                    <span className="font-medium tabular-nums">
                      {s?.format ? s.format(Number(value)) : String(value)}
                    </span>
                  </div>
                );
              }}
            />
          }
        />
        {series.map((s, i) => (
          <Bar
            key={s.key}
            dataKey={s.key}
            stackId={stacked ? "stack" : undefined}
            fill={`var(--color-${s.key})`}
            // Only the top segment of a stack gets rounded ends
            radius={!stacked || i === series.length - 1 ? [3, 3, 0, 0] : 0}
            maxBarSize={24}
            isAnimationActive={false}
          />
        ))}
      </BarChart>
    </ChartContainer>
  );
}

export interface HBarRow {
  key: string;
  label: string;
  /** Bar length as a share of the track, 0 to 1 */
  fraction: number;
  value: string;
  href?: string;
}

/** Ranked rows: name, a proportional bar, and the value written out */
export function HBarList({ rows, color }: { rows: HBarRow[]; color: string }) {
  return (
    <div className="space-y-1.5">
      {rows.map((r) => {
        const body = (
          <>
            <span className="w-24 shrink-0 truncate">{r.label}</span>
            <span className="h-2 flex-1 overflow-hidden rounded-full bg-muted">
              <span
                className="block h-full rounded-full"
                style={{ width: `${Math.max(0, Math.min(1, r.fraction)) * 100}%`, backgroundColor: color }}
              />
            </span>
            <span className="min-w-14 shrink-0 text-right tabular-nums text-muted-foreground">{r.value}</span>
          </>
        );
        const className = "flex items-center gap-2 text-xs";
        return r.href ? (
          <Link key={r.key} href={r.href} className={`${className} hover:underline`}>
            {body}
          </Link>
        ) : (
          <div key={r.key} className={className}>
            {body}
          </div>
        );
      })}
    </div>
  );
}
