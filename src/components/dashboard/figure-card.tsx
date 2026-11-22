"use client";

import { ChartBlock, Headline, ModuleCard, StatRow, StatRows } from "@/components/dashboard/module-card";
import { SparkBars } from "@/components/dashboard/spark";
import { useFitnessStats } from "@/hooks/figure/use-fitness-stats";
import { useShoppingItems } from "@/hooks/figure/use-shopping-items";
import { useWorkoutLogs } from "@/hooks/figure/use-workout-logs";
import { weekDelta } from "@/lib/dashboard/stats";
import { formatDay, formatMiles } from "@/lib/figure/format";

// Same colors as the Fitness charts: lifting is --chart-1, running is --chart-2
const LIFT_COLOR = "var(--chart-1)";
const RUN_COLOR = "var(--chart-2)";
const WEEKS = 12;

const whole = new Intl.NumberFormat("en-US");
const days = (n: number) => `${n} day${n !== 1 ? "s" : ""}`;

export function FigureCard() {
  const { stats, isLoading: statsLoading, isError: statsError } = useFitnessStats(WEEKS);
  const { logs, hasData: hasLogs, isLoading: logsLoading, isError: logsError } = useWorkoutLogs({ limit: 1 });
  const { items, hasData: hasItems, isLoading: itemsLoading, isError: itemsError } = useShoppingItems();
  // A read that failed with nothing cached says so instead of showing zeros
  const NOT_LOADED = "Could not load";

  const last = logs[0];
  const toBuy = items.filter((i) => !i.checked).length;
  const weeks = (stats?.weeks ?? []).map((w) => ({ label: `Week of ${w.label}`, sessions: w.sessions, runs: w.runs }));
  const hasActivity = weeks.some((w) => w.sessions > 0 || w.runs > 0);
  const sessions = stats?.thisWeek.sessions ?? 0;

  return (
    <ModuleCard moduleId="figure" href="/figure/fitness" isLoading={statsLoading || logsLoading || itemsLoading}>
      <Headline
        label="Workouts this week"
        value={statsError && !stats ? "—" : sessions}
        sub={stats ? weekDelta(sessions, stats.lastWeek.sessions) : statsError ? "Could not load your training" : undefined}
      />

      {hasActivity && (
        <ChartBlock
          caption={`Last ${WEEKS} weeks`}
          legend={[
            { label: "Workouts", color: LIFT_COLOR },
            { label: "Runs", color: RUN_COLOR },
          ]}
        >
          <SparkBars
            stacked
            data={weeks}
            series={[
              { key: "sessions", label: "Workouts", color: LIFT_COLOR },
              { key: "runs", label: "Runs", color: RUN_COLOR },
            ]}
          />
        </ChartBlock>
      )}

      <StatRows>
        {stats && (
          <>
            <StatRow
              label="Streak"
              value={`${days(stats.streak.current)} · best ${stats.streak.longest}`}
              href="/figure/fitness"
            />
            <StatRow
              label="Miles"
              value={`${formatMiles(stats.thisWeek.miles)} · last week ${formatMiles(stats.lastWeek.miles)}`}
              href="/figure/fitness?tab=runs"
            />
            <StatRow
              label="Volume"
              value={`${whole.format(stats.thisWeek.volume)} lb · last week ${whole.format(stats.lastWeek.volume)}`}
            />
          </>
        )}
        <StatRow
          label="Last workout"
          value={last ? `${last.name} · ${formatDay(last.date)}` : logsError && !hasLogs ? NOT_LOADED : "None yet"}
        />
        <StatRow
          label="Shopping list"
          value={itemsError && !hasItems ? NOT_LOADED : `${toBuy} item${toBuy !== 1 ? "s" : ""} to buy`}
          href="/figure/diet?tab=shopping"
        />
      </StatRows>
    </ModuleCard>
  );
}
