"use client";

import { MoreHorizontal, Pencil, Play, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { formatWeight } from "@/lib/figure/format";
import type { Workout } from "@/types/figure/fitness";

interface WorkoutCardProps {
  workout: Workout;
  onLog: (w: Workout) => void;
  onEdit: (w: Workout) => void;
  onDelete: (w: Workout) => void;
}

export function WorkoutCard({ workout, onLog, onEdit, onDelete }: WorkoutCardProps) {
  return (
    <Card className="flex flex-col">
      <CardHeader className="flex flex-row items-start justify-between gap-2 pb-2">
        <CardTitle className="text-base">{workout.name}</CardTitle>
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="ghost" size="icon" className="-mt-1 h-8 w-8" aria-label="Workout actions">
              <MoreHorizontal className="h-4 w-4" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            <DropdownMenuItem onClick={() => onEdit(workout)}>
              <Pencil className="mr-2 h-4 w-4" />
              Edit
            </DropdownMenuItem>
            <DropdownMenuItem onClick={() => onDelete(workout)} className="text-destructive">
              <Trash2 className="mr-2 h-4 w-4" />
              Delete
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </CardHeader>
      <CardContent className="flex flex-1 flex-col gap-3">
        {workout.exercises.length === 0 ? (
          <p className="text-sm text-muted-foreground">No exercises yet</p>
        ) : (
          <ul className="space-y-1 text-sm">
            {workout.exercises.map((e, i) => (
              <li key={i} className="flex justify-between gap-2">
                <span className="truncate">{e.name}</span>
                <span className="shrink-0 tabular-nums text-muted-foreground">
                  {e.targetSets}×{e.targetReps}
                  {e.targetWeight ? ` @ ${formatWeight(e.targetWeight)}` : ""}
                </span>
              </li>
            ))}
          </ul>
        )}
        {workout.notes && <p className="text-xs text-muted-foreground">{workout.notes}</p>}
        <Button variant="secondary" size="sm" className="mt-auto" onClick={() => onLog(workout)}>
          <Play className="mr-1 h-4 w-4" />
          Log this workout
        </Button>
      </CardContent>
    </Card>
  );
}
