"use client";

import { useState } from "react";
import Link from "next/link";
import { Activity, Dumbbell, Footprints, Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { LoadingState } from "@/components/loading-state";
import { EmptyState } from "@/components/empty-state";
import {
  ActivityHeatmap,
  ExerciseProgressChart,
  PaceChart,
  WeeklyMilesChart,
  WeeklyVolumeChart,
} from "@/components/figure/fitness-charts";
import { useExerciseProgress, useFitnessStats } from "@/hooks/figure/use-fitness-stats";
import { useWorkoutLogs } from "@/hooks/figure/use-workout-logs";
import { useRuns } from "@/hooks/figure/use-runs";
import { formatDay, formatDuration, formatMiles, formatPace } from "@/lib/figure/format";

const RANGES = [
  { value: "4", label: "4W" },
  { value: "12", label: "12W" },
  { value: "26", label: "6M" },
  { value: "52", label: "1Y" },
];

const whole = new Intl.NumberFormat("en-US");

/** Fitness overview: weekly totals, activity grid and trend charts for lifting and running */
export function FitnessDashboard() {
  const [weeks, setWeeks] = useState(12);
  const { stats, isLoading } = useFitnessStats(weeks);
  const [pickedExercise, setPickedExercise] = useState<string | null>(null);
  const exercise = pickedExercise ?? stats?.topExercises[0]?.name ?? null;
  const { points } = useExerciseProgress(exercise, stats?.range.start);

  const { logs: recentLogs } = useWorkoutLogs({ limit: 6 });
  const { runs } = useRuns();
  const recent = [
    ...recentLogs.map((l) => ({
      key: `l-${l._id}`,
      date: l.date,
      kind: "lift" as const,
      title: l.name,
      detail: `${l.exercises.length} exercise${l.exercises.length !== 1 ? "s" : ""}`,
      created: l.createdAt,
    })),
    ...runs.slice(0, 6).map((r) => ({
      key: `r-${r._id}`,
      date: r.date,
      kind: "run" as const,
      title: `${formatMiles(r.distance)} run`,
      detail: `${formatDuration(r.durationSeconds)} · ${formatPace(r.durationSeconds, r.distance)}`,
      created: r.createdAt,
    })),
  ]
    .sort((a, b) => b.date.localeCompare(a.date) || b.created.localeCompare(a.created))
    .slice(0, 6);

  const rangeTabs = (
    <Tabs value={String(weeks)} onValueChange={(v) => setWeeks(Number(v))}>
      <TabsList>
        {RANGES.map((r) => (
          <TabsTrigger key={r.value} value={r.value}>
            {r.label}
          </TabsTrigger>
        ))}
      </TabsList>
    </Tabs>
  );

  const hasData =
    !!stats && (stats.weeks.some((w) => w.sessions > 0 || w.runs > 0) || stats.streak.longest > 0);

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between gap-2">
        <p className="text-sm text-muted-foreground">Training at a glance</p>
        {rangeTabs}
      </div>

      {isLoading && !stats ? (
        <LoadingState variant="chart" />
      ) : !stats || !hasData ? (
        <EmptyState
          icon={Activity}
          title="No training logged yet"
          description="Log a workout or a run and your trends will show up here."
          action={undefined}
        />
      ) : (
        <>
          <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
            <StatTile
              label="Workouts this week"
              value={String(stats.thisWeek.sessions)}
              sub={`Last week: ${stats.lastWeek.sessions}`}
            />
            <StatTile
              label="Miles this week"
              value={formatMiles(stats.thisWeek.miles)}
              sub={`Last week: ${formatMiles(stats.lastWeek.miles)}`}
            />
            <StatTile
              label="Volume this week"
              value={`${whole.format(stats.thisWeek.volume)} lb`}
              sub={`Last week: ${whole.format(stats.lastWeek.volume)} lb`}
            />
            <StatTile
              label="Current streak"
              value={`${stats.streak.current} day${stats.streak.current !== 1 ? "s" : ""}`}
              sub={`Longest: ${stats.streak.longest} day${stats.streak.longest !== 1 ? "s" : ""}`}
            />
          </div>

          <Card>
            <CardHeader>
              <CardTitle className="text-base">Activity</CardTitle>
              <CardDescription>Days with a workout or run</CardDescription>
            </CardHeader>
            <CardContent>
              <ActivityHeatmap days={stats.days} />
            </CardContent>
          </Card>

          <div className="grid gap-6 lg:grid-cols-2">
            <ChartCard title="Weekly mileage" description="Miles run per week">
              {stats.weeks.some((w) => w.miles > 0) ? (
                <WeeklyMilesChart weeks={stats.weeks} />
              ) : (
                <ChartEmpty icon={Footprints} text="No runs in this range" href="/figure/fitness?tab=runs" />
              )}
            </ChartCard>

            <ChartCard title="Weekly lifting volume" description="Reps × weight of completed sets, per week">
              {stats.weeks.some((w) => w.volume > 0) ? (
                <WeeklyVolumeChart weeks={stats.weeks} />
              ) : (
                <ChartEmpty icon={Dumbbell} text="No lifting in this range" href="/figure/fitness?tab=log" />
              )}
            </ChartCard>

            <ChartCard title="Running pace" description="Pace per run · faster is higher">
              {stats.paces.length > 0 ? (
                <PaceChart paces={stats.paces} />
              ) : (
                <ChartEmpty icon={Footprints} text="No runs in this range" href="/figure/fitness?tab=runs" />
              )}
            </ChartCard>

            <ChartCard
              title="Strength progress"
              description="Estimated 1-rep max from the best set each session"
              action={
                stats.topExercises.length > 0 && (
                  <Select value={exercise ?? undefined} onValueChange={setPickedExercise}>
                    <SelectTrigger size="sm" className="w-44" aria-label="Exercise">
                      <SelectValue placeholder="Exercise" />
                    </SelectTrigger>
                    <SelectContent>
                      {stats.topExercises.map((e) => (
                        <SelectItem key={e.name} value={e.name}>
                          {e.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                )
              }
            >
              {points.length > 0 ? (
                <ExerciseProgressChart points={points} />
              ) : (
                <ChartEmpty icon={Dumbbell} text="No lifts in this range" href="/figure/fitness?tab=log" />
              )}
            </ChartCard>
          </div>

          <Card>
            <CardHeader className="flex flex-row items-center justify-between">
              <CardTitle className="text-base">Recent activity</CardTitle>
              <Button variant="ghost" size="sm" asChild>
                <Link href="/figure/fitness?tab=log">
                  <Plus className="mr-1 h-4 w-4" />
                  Log
                </Link>
              </Button>
            </CardHeader>
            <CardContent>
              <ul className="divide-y">
                {recent.map((a) => (
                  <li key={a.key} className="flex items-center gap-3 py-2 text-sm">
                    {a.kind === "run" ? (
                      <Footprints className="h-4 w-4 shrink-0 text-muted-foreground" />
                    ) : (
                      <Dumbbell className="h-4 w-4 shrink-0 text-muted-foreground" />
                    )}
                    <span className="flex-1 truncate font-medium">{a.title}</span>
                    <span className="hidden tabular-nums text-muted-foreground sm:inline">{a.detail}</span>
                    <span className="w-24 shrink-0 text-right text-muted-foreground">{formatDay(a.date)}</span>
                  </li>
                ))}
              </ul>
            </CardContent>
          </Card>
        </>
      )}
    </div>
  );
}

function StatTile({ label, value, sub }: { label: string; value: string; sub: string }) {
  return (
    <Card className="gap-1 py-4">
      <CardContent className="px-4">
        <p className="text-xs text-muted-foreground">{label}</p>
        <p className="text-2xl font-bold tabular-nums">{value}</p>
        <p className="text-xs text-muted-foreground">{sub}</p>
      </CardContent>
    </Card>
  );
}

function ChartCard({
  title,
  description,
  action,
  children,
}: {
  title: string;
  description: string;
  action?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <Card>
      <CardHeader className="flex flex-row items-start justify-between gap-2">
        <div className="space-y-1">
          <CardTitle className="text-base">{title}</CardTitle>
          <CardDescription>{description}</CardDescription>
        </div>
        {action}
      </CardHeader>
      <CardContent>{children}</CardContent>
    </Card>
  );
}

function ChartEmpty({ icon: Icon, text, href }: { icon: typeof Dumbbell; text: string; href: string }) {
  return (
    <div className="flex h-56 flex-col items-center justify-center gap-2 text-sm text-muted-foreground">
      <Icon className="h-6 w-6" />
      <span>{text}</span>
      <Link href={href} className="underline-offset-4 hover:underline">
        Log one
      </Link>
    </div>
  );
}
