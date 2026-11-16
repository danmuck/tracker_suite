"use client";

import { Bar, BarChart, CartesianGrid, Line, LineChart, XAxis, YAxis } from "recharts";
import { ChartContainer, ChartTooltip, ChartTooltipContent, type ChartConfig } from "@/components/ui/chart";
import { formatDay, formatDuration } from "@/lib/figure/format";
import type { DayPoint, ExerciseProgressPoint, PacePoint, WeekPoint } from "@/lib/figure/stats";
import { cn } from "@/lib/utils";

/**
 * Entity colors stay fixed across every chart: running is --chart-2, lifting is --chart-1.
 * Each chart plots a single series, so the card title names it and no legend is needed.
 */
const RUN_COLOR = "var(--chart-2)";
const LIFT_COLOR = "var(--chart-1)";

const axisProps = {
  tickLine: false,
  axisLine: false,
  tickMargin: 8,
  fontSize: 12,
} as const;

/**
 * Round tick values for a padded [min, max]: picks the smallest step from `steps`
 * that gives at most 5 intervals, so axes read 8:00 / 8:30 / 9:00 instead of 8:21 / 8:41.
 */
function niceTicks(values: number[], steps: number[]): { domain: [number, number]; ticks: number[] } {
  const lo = Math.min(...values);
  const hi = Math.max(...values);
  const step = steps.find((st) => Math.ceil(hi / st) - Math.floor(lo / st) <= 5) ?? steps[steps.length - 1];
  let start = Math.floor(lo / step) * step;
  let end = Math.ceil(hi / step) * step;
  if (start === end) {
    start -= step;
    end += step;
  }
  const ticks: number[] = [];
  for (let t = start; t <= end + 1e-9; t += step) ticks.push(t);
  return { domain: [start, end], ticks };
}

const compact = new Intl.NumberFormat("en-US", { notation: "compact", maximumFractionDigits: 1 });
const whole = new Intl.NumberFormat("en-US");

function weekLabel(_: unknown, payload: readonly { payload?: WeekPoint }[]) {
  const w = payload?.[0]?.payload;
  return w ? `Week of ${formatDay(w.weekStart, "MMM d, yyyy")}` : "";
}

export function WeeklyMilesChart({ weeks }: { weeks: WeekPoint[] }) {
  const config: ChartConfig = { miles: { label: "Miles", color: RUN_COLOR } };
  return (
    <ChartContainer config={config} className="aspect-auto h-56 w-full">
      <BarChart data={weeks} margin={{ left: -12, right: 4, top: 8 }}>
        <CartesianGrid vertical={false} strokeOpacity={0.5} />
        <XAxis dataKey="label" {...axisProps} minTickGap={16} />
        <YAxis {...axisProps} width={44} allowDecimals={false} />
        <ChartTooltip
          cursor={{ fillOpacity: 0.3 }}
          content={
            <ChartTooltipContent
              labelFormatter={weekLabel}
              formatter={(value, _name, item) => (
                <div className="flex w-full justify-between gap-4">
                  <span className="text-muted-foreground">Miles</span>
                  <span className="font-medium tabular-nums">
                    {Number(value)} mi · {item.payload.runs} run{item.payload.runs !== 1 ? "s" : ""}
                  </span>
                </div>
              )}
            />
          }
        />
        <Bar dataKey="miles" fill="var(--color-miles)" radius={[4, 4, 0, 0]} maxBarSize={28} />
      </BarChart>
    </ChartContainer>
  );
}

export function WeeklyVolumeChart({ weeks }: { weeks: WeekPoint[] }) {
  const config: ChartConfig = { volume: { label: "Volume", color: LIFT_COLOR } };
  return (
    <ChartContainer config={config} className="aspect-auto h-56 w-full">
      <BarChart data={weeks} margin={{ left: -4, right: 4, top: 8 }}>
        <CartesianGrid vertical={false} strokeOpacity={0.5} />
        <XAxis dataKey="label" {...axisProps} minTickGap={16} />
        <YAxis {...axisProps} width={52} tickFormatter={(v) => compact.format(v)} />
        <ChartTooltip
          cursor={{ fillOpacity: 0.3 }}
          content={
            <ChartTooltipContent
              labelFormatter={weekLabel}
              formatter={(value, _name, item) => (
                <div className="grid w-full gap-0.5">
                  <div className="flex justify-between gap-4">
                    <span className="text-muted-foreground">Volume</span>
                    <span className="font-medium tabular-nums">{whole.format(Number(value))} lb</span>
                  </div>
                  <div className="flex justify-between gap-4">
                    <span className="text-muted-foreground">Workouts</span>
                    <span className="tabular-nums">
                      {item.payload.sessions} · {item.payload.sets} sets
                    </span>
                  </div>
                </div>
              )}
            />
          }
        />
        <Bar dataKey="volume" fill="var(--color-volume)" radius={[4, 4, 0, 0]} maxBarSize={28} />
      </BarChart>
    </ChartContainer>
  );
}

/** Pace per run over time. The y-axis is flipped so faster (lower) pace plots higher. */
export function PaceChart({ paces }: { paces: PacePoint[] }) {
  const config: ChartConfig = { paceSeconds: { label: "Pace", color: RUN_COLOR } };
  const { domain, ticks } = niceTicks(
    paces.map((p) => p.paceSeconds),
    [15, 30, 60, 120, 300]
  );
  return (
    <ChartContainer config={config} className="aspect-auto h-56 w-full">
      <LineChart data={paces} margin={{ left: -4, right: 8, top: 8 }}>
        <CartesianGrid vertical={false} strokeOpacity={0.5} />
        <XAxis dataKey="label" {...axisProps} minTickGap={16} />
        <YAxis
          {...axisProps}
          width={48}
          reversed
          domain={domain}
          ticks={ticks}
          tickFormatter={(v) => formatDuration(v)}
        />
        <ChartTooltip
          content={
            <ChartTooltipContent
              labelFormatter={(_, payload) => {
                const p = payload?.[0]?.payload as PacePoint | undefined;
                return p ? formatDay(p.date, "EEE, MMM d") : "";
              }}
              formatter={(value, _name, item) => (
                <div className="flex w-full justify-between gap-4">
                  <span className="text-muted-foreground">Pace</span>
                  <span className="font-medium tabular-nums">
                    {formatDuration(Number(value))} /mi · {item.payload.distance} mi
                  </span>
                </div>
              )}
            />
          }
        />
        <Line
          dataKey="paceSeconds"
          stroke="var(--color-paceSeconds)"
          strokeWidth={2}
          dot={{ r: 4, strokeWidth: 2, stroke: "var(--background)", fill: "var(--color-paceSeconds)" }}
          activeDot={{ r: 5 }}
          type="monotone"
        />
      </LineChart>
    </ChartContainer>
  );
}

/** Estimated 1RM for one exercise per session (best set by Epley) */
export function ExerciseProgressChart({ points }: { points: ExerciseProgressPoint[] }) {
  const config: ChartConfig = { e1rm: { label: "Est. 1RM", color: LIFT_COLOR } };
  const { domain, ticks } = niceTicks(
    points.map((p) => p.e1rm),
    [5, 10, 25, 50, 100]
  );
  return (
    <ChartContainer config={config} className="aspect-auto h-56 w-full">
      <LineChart data={points} margin={{ left: -4, right: 8, top: 8 }}>
        <CartesianGrid vertical={false} strokeOpacity={0.5} />
        <XAxis dataKey="label" {...axisProps} minTickGap={16} />
        <YAxis {...axisProps} width={44} domain={domain} ticks={ticks} tickFormatter={(v) => whole.format(Math.round(v))} />
        <ChartTooltip
          content={
            <ChartTooltipContent
              labelFormatter={(_, payload) => {
                const p = payload?.[0]?.payload as ExerciseProgressPoint | undefined;
                return p ? formatDay(p.date, "EEE, MMM d") : "";
              }}
              formatter={(value, _name, item) => (
                <div className="grid w-full gap-0.5">
                  <div className="flex justify-between gap-4">
                    <span className="text-muted-foreground">Est. 1RM</span>
                    <span className="font-medium tabular-nums">{whole.format(Number(value))} lb</span>
                  </div>
                  <div className="flex justify-between gap-4">
                    <span className="text-muted-foreground">Best set</span>
                    <span className="tabular-nums">
                      {item.payload.topReps} × {item.payload.topWeight} lb
                    </span>
                  </div>
                </div>
              )}
            />
          }
        />
        <Line
          dataKey="e1rm"
          stroke="var(--color-e1rm)"
          strokeWidth={2}
          dot={{ r: 4, strokeWidth: 2, stroke: "var(--background)", fill: "var(--color-e1rm)" }}
          activeDot={{ r: 5 }}
          type="monotone"
        />
      </LineChart>
    </ChartContainer>
  );
}

/**
 * One cell per day, weeks as columns (Mon at top). Shade is a single-hue
 * sequential scale on how many sessions were logged; the hover title spells it out.
 */
export function ActivityHeatmap({ days }: { days: DayPoint[] }) {
  const columns: DayPoint[][] = [];
  for (let i = 0; i < days.length; i += 7) columns.push(days.slice(i, i + 7));
  const level = (d: DayPoint) => Math.min(d.lifts + d.runs, 3);
  const shades = ["bg-muted", "bg-primary/35", "bg-primary/65", "bg-primary"];

  const describe = (d: DayPoint) => {
    const parts = [
      d.lifts && `${d.lifts} workout${d.lifts !== 1 ? "s" : ""}`,
      d.runs && `${d.runs} run${d.runs !== 1 ? "s" : ""}`,
    ].filter(Boolean);
    return `${formatDay(d.date, "EEE, MMM d")}: ${parts.join(", ") || "rest"}`;
  };

  return (
    <div className="space-y-2">
      <div className="flex gap-2 overflow-x-auto pb-1">
        <div className="grid shrink-0 grid-rows-7 gap-[3px] text-[10px] leading-none text-muted-foreground">
          {["Mon", "", "Wed", "", "Fri", "", "Sun"].map((l, i) => (
            <span key={i} className="flex h-3.5 items-center">
              {l}
            </span>
          ))}
        </div>
        <div className="flex gap-[3px]">
          {columns.map((col) => (
            <div key={col[0].date} className="grid grid-rows-7 gap-[3px]">
              {col.map((d) => (
                <div
                  key={d.date}
                  title={describe(d)}
                  aria-label={describe(d)}
                  className={cn("h-3.5 w-3.5 rounded-[3px]", shades[level(d)])}
                />
              ))}
            </div>
          ))}
        </div>
      </div>
      <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
        <span>Rest</span>
        {shades.map((s) => (
          <span key={s} className={cn("h-3 w-3 rounded-[3px]", s)} />
        ))}
        <span>3+ sessions</span>
      </div>
    </div>
  );
}
