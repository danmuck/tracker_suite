"use client";

import { MoreHorizontal, Pencil, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { formatDay, summarizeSets } from "@/lib/figure/format";
import type { WorkoutLog } from "@/types/figure/fitness";

interface WorkoutLogCardProps {
  log: WorkoutLog;
  showDate?: boolean;
  onEdit: (log: WorkoutLog) => void;
  onDelete: (log: WorkoutLog) => void;
}

export function WorkoutLogCard({ log, showDate = true, onEdit, onDelete }: WorkoutLogCardProps) {
  const setCount = log.exercises.reduce((n, e) => n + e.sets.filter((s) => s.done !== false).length, 0);
  return (
    <Card className="gap-2 py-4">
      <CardHeader className="flex flex-row items-start justify-between gap-2 px-4">
        <div>
          <CardTitle className="text-base">{log.name}</CardTitle>
          <p className="text-xs text-muted-foreground">
            {showDate && `${formatDay(log.date)} · `}
            {log.exercises.length} exercise{log.exercises.length !== 1 ? "s" : ""} · {setCount} set
            {setCount !== 1 ? "s" : ""}
          </p>
        </div>
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="ghost" size="icon" className="-mt-1 h-8 w-8" aria-label="Log actions">
              <MoreHorizontal className="h-4 w-4" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            <DropdownMenuItem onClick={() => onEdit(log)}>
              <Pencil className="mr-2 h-4 w-4" />
              Edit
            </DropdownMenuItem>
            <DropdownMenuItem onClick={() => onDelete(log)} className="text-destructive">
              <Trash2 className="mr-2 h-4 w-4" />
              Delete
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </CardHeader>
      <CardContent className="px-4">
        <ul className="space-y-1 text-sm">
          {log.exercises.map((e, i) => (
            <li key={i} className="flex justify-between gap-3">
              <span className="truncate">{e.name}</span>
              <span className="shrink-0 tabular-nums text-muted-foreground">{summarizeSets(e.sets)}</span>
            </li>
          ))}
        </ul>
        {log.notes && <p className="mt-2 text-xs text-muted-foreground">{log.notes}</p>}
      </CardContent>
    </Card>
  );
}
