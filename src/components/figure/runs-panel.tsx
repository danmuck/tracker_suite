"use client";

import { CircleAlert, Footprints, MoreHorizontal, Pencil, Trash2 } from "lucide-react";
import { endOfWeek, startOfMonth, startOfWeek } from "date-fns";
import { WEEK_OPTS } from "@/lib/figure/stats";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { EmptyState } from "@/components/empty-state";
import { LoadingState } from "@/components/loading-state";
import { RUN_TYPE_LABELS } from "@/components/figure/run-form";
import { formatDay, formatDuration, formatMiles, formatPace, toDay } from "@/lib/figure/format";
import type { RunLog } from "@/types/figure/fitness";

interface RunsPanelProps {
  runs: RunLog[];
  isLoading: boolean;
  /** The runs could not be read and there are none to show */
  isError?: boolean;
  onNew: () => void;
  onEdit: (r: RunLog) => void;
  onDelete: (r: RunLog) => void;
}

function sumMiles(runs: RunLog[]) {
  return runs.reduce((n, r) => n + r.distance, 0);
}

export function RunsPanel({ runs, isLoading, isError = false, onNew, onEdit, onDelete }: RunsPanelProps) {
  if (isLoading) return <LoadingState variant="table" />;
  if (isError) {
    return (
      <EmptyState
        icon={CircleAlert}
        title="Could not load runs"
        description="Something went wrong reading your runs. Reload the page to try again."
      />
    );
  }
  if (runs.length === 0) {
    return (
      <EmptyState
        icon={Footprints}
        title="No runs yet"
        description="Log distance and time; pace is worked out for you."
        action={{ label: "Log run", onClick: onNew }}
      />
    );
  }

  const now = new Date();
  const weekStart = toDay(startOfWeek(now, WEEK_OPTS));
  const weekEnd = toDay(endOfWeek(now, WEEK_OPTS));
  const monthStart = toDay(startOfMonth(now));
  const thisWeek = runs.filter((r) => r.date >= weekStart && r.date <= weekEnd);
  const thisMonth = runs.filter((r) => r.date >= monthStart);
  const longest = runs.reduce((a, b) => (b.distance > a.distance ? b : a));

  const stats = [
    { label: "This week", value: formatMiles(sumMiles(thisWeek)), sub: `${thisWeek.length} run${thisWeek.length !== 1 ? "s" : ""}` },
    { label: "This month", value: formatMiles(sumMiles(thisMonth)), sub: `${thisMonth.length} run${thisMonth.length !== 1 ? "s" : ""}` },
    {
      label: "Avg pace (month)",
      value: thisMonth.length
        ? formatPace(thisMonth.reduce((n, r) => n + r.durationSeconds, 0), sumMiles(thisMonth))
        : "—",
      sub: "time ÷ distance",
    },
    { label: "Longest run", value: formatMiles(longest.distance), sub: formatDay(longest.date, "MMM d, yyyy") },
  ];

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        {stats.map((s) => (
          <Card key={s.label} className="gap-1 py-4">
            <CardContent className="px-4">
              <p className="text-xs text-muted-foreground">{s.label}</p>
              <p className="text-xl font-bold tabular-nums">{s.value}</p>
              <p className="text-xs text-muted-foreground">{s.sub}</p>
            </CardContent>
          </Card>
        ))}
      </div>

      <div className="rounded-lg border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Date</TableHead>
              <TableHead>Type</TableHead>
              <TableHead className="text-right">Distance</TableHead>
              <TableHead className="text-right">Time</TableHead>
              <TableHead className="text-right">Pace</TableHead>
              <TableHead className="hidden md:table-cell">Notes</TableHead>
              <TableHead className="w-10" />
            </TableRow>
          </TableHeader>
          <TableBody>
            {runs.map((r) => (
              <TableRow key={r._id}>
                <TableCell className="whitespace-nowrap">{formatDay(r.date)}</TableCell>
                <TableCell>
                  <Badge variant="secondary">{RUN_TYPE_LABELS[r.type]}</Badge>
                </TableCell>
                <TableCell className="text-right tabular-nums">{formatMiles(r.distance)}</TableCell>
                <TableCell className="text-right tabular-nums">{formatDuration(r.durationSeconds)}</TableCell>
                <TableCell className="text-right tabular-nums">{formatPace(r.durationSeconds, r.distance)}</TableCell>
                <TableCell className="hidden max-w-xs truncate text-muted-foreground md:table-cell">
                  {r.notes}
                </TableCell>
                <TableCell>
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <Button variant="ghost" size="icon" className="h-8 w-8" aria-label="Run actions">
                        <MoreHorizontal className="h-4 w-4" />
                      </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end">
                      <DropdownMenuItem onClick={() => onEdit(r)}>
                        <Pencil className="mr-2 h-4 w-4" />
                        Edit
                      </DropdownMenuItem>
                      <DropdownMenuItem onClick={() => onDelete(r)} className="text-destructive">
                        <Trash2 className="mr-2 h-4 w-4" />
                        Delete
                      </DropdownMenuItem>
                    </DropdownMenuContent>
                  </DropdownMenu>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}
