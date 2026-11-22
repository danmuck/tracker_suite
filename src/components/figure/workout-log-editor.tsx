"use client";

import { useEffect, useState } from "react";
import { CalendarIcon, Copy, Loader2, Plus, Trash2, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Calendar } from "@/components/ui/calendar";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Textarea } from "@/components/ui/textarea";
import { ExerciseNameInput } from "@/components/figure/exercise-name-input";
import { useExerciseHistory } from "@/hooks/figure/use-workout-logs";
import { formatDay, fromDay, parseOptionalNumber, summarizeSets, toDay } from "@/lib/figure/format";
import type { WorkoutLogFormData } from "@/types/figure/fitness";

interface SetRow {
  key: number;
  reps: string;
  weight: string;
  done: boolean;
}
interface ExerciseRow {
  key: number;
  name: string;
  sets: SetRow[];
}

let k = 0;
const setRow = (reps = "", weight = "", done = false): SetRow => ({ key: k++, reps, weight, done });

function useDebounced<T>(value: T, ms: number): T {
  const [v, setV] = useState(value);
  useEffect(() => {
    const t = setTimeout(() => setV(value), ms);
    return () => clearTimeout(t);
  }, [value, ms]);
  return v;
}

interface WorkoutLogEditorProps {
  initial: WorkoutLogFormData;
  /** Set when editing an existing log, so its own sets aren't shown as "last time" */
  logId?: string;
  onSubmit: (data: WorkoutLogFormData) => Promise<void>;
  onCancel: () => void;
}

export function WorkoutLogEditor({ initial, logId, onSubmit, onCancel }: WorkoutLogEditorProps) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [date, setDate] = useState(initial.date);
  const [dateOpen, setDateOpen] = useState(false);
  const [name, setName] = useState(initial.name);
  const [notes, setNotes] = useState(initial.notes ?? "");
  const [exercises, setExercises] = useState<ExerciseRow[]>(() =>
    initial.exercises.map((e) => ({
      key: k++,
      name: e.name,
      sets: e.sets.map((s) => setRow(String(s.reps), s.weight ? String(s.weight) : "", s.done)),
    }))
  );

  const names = useDebounced(
    exercises.map((e) => e.name.trim()).filter(Boolean),
    400
  );
  const { history } = useExerciseHistory(names, date, logId);

  function patchExercise(key: number, fn: (e: ExerciseRow) => ExerciseRow) {
    setExercises((es) => es.map((e) => (e.key === key ? fn(e) : e)));
  }
  function patchSet(exKey: number, setKey: number, patch: Partial<SetRow>) {
    patchExercise(exKey, (e) => ({
      ...e,
      sets: e.sets.map((s) => (s.key === setKey ? { ...s, ...patch } : s)),
    }));
  }
  function addSet(exKey: number) {
    patchExercise(exKey, (e) => {
      const last = e.sets[e.sets.length - 1];
      return { ...e, sets: [...e.sets, setRow(last?.reps ?? "", last?.weight ?? "")] };
    });
  }
  function applyLastTime(exKey: number, lowerName: string) {
    const h = history[lowerName];
    if (!h) return;
    patchExercise(exKey, (e) => ({
      ...e,
      sets: h.sets.map((s) => setRow(String(s.reps), s.weight ? String(s.weight) : "")),
    }));
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!name.trim()) return setError("Name is required");
    setError(null);
    setLoading(true);
    try {
      await onSubmit({
        date,
        workoutId: initial.workoutId,
        name: name.trim(),
        notes: notes.trim() || undefined,
        exercises: exercises
          .filter((ex) => ex.name.trim())
          .map((ex) => ({
            name: ex.name.trim(),
            sets: ex.sets
              .filter((s) => s.reps.trim() !== "" || s.weight.trim() !== "")
              .map((s) => ({
                reps: Math.max(0, Math.round(parseOptionalNumber(s.reps) ?? 0)),
                weight: Math.max(0, parseOptionalNumber(s.weight) ?? 0),
                done: s.done,
              })),
          })),
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to save");
    } finally {
      setLoading(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <div className="grid gap-3 sm:grid-cols-[1fr_auto]">
        <div className="space-y-1">
          <Label htmlFor="log-name">Workout</Label>
          <Input id="log-name" value={name} onChange={(e) => setName(e.target.value)} />
        </div>
        <div className="space-y-1">
          <Label>Date</Label>
          <Popover open={dateOpen} onOpenChange={setDateOpen}>
            <PopoverTrigger asChild>
              <Button type="button" variant="outline" className="w-full justify-start sm:w-44">
                <CalendarIcon className="mr-2 h-4 w-4" />
                {formatDay(date, "MMM d, yyyy")}
              </Button>
            </PopoverTrigger>
            <PopoverContent className="w-auto p-0" align="end">
              <Calendar
                mode="single"
                selected={fromDay(date)}
                defaultMonth={fromDay(date)}
                onSelect={(d) => {
                  if (d) {
                    setDate(toDay(d));
                    setDateOpen(false);
                  }
                }}
              />
            </PopoverContent>
          </Popover>
        </div>
      </div>

      <div className="max-h-[55vh] space-y-3 overflow-y-auto pr-1">
        {exercises.map((ex) => {
          const lower = ex.name.trim().toLowerCase();
          const last = lower ? history[lower] : undefined;
          return (
            <div key={ex.key} className="space-y-2 rounded-lg border p-3">
              <div className="flex items-center gap-2">
                <ExerciseNameInput
                  value={ex.name}
                  onChange={(e) => patchExercise(ex.key, (x) => ({ ...x, name: e.target.value }))}
                  aria-label="Exercise name"
                  className="font-medium"
                />
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  onClick={() => setExercises((es) => es.filter((x) => x.key !== ex.key))}
                  aria-label="Remove exercise"
                >
                  <Trash2 className="h-4 w-4" />
                </Button>
              </div>

              {last && (
                <div className="flex items-center justify-between gap-2 text-xs text-muted-foreground">
                  <span>
                    Last time ({formatDay(last.date, "MMM d")}): {summarizeSets(last.sets)}
                  </span>
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    className="h-6 px-2 text-xs"
                    onClick={() => applyLastTime(ex.key, lower)}
                  >
                    <Copy className="mr-1 h-3 w-3" />
                    Use
                  </Button>
                </div>
              )}

              {ex.sets.length > 0 && (
                <div className="grid grid-cols-[2rem_1fr_1fr_2rem_2rem] items-center gap-2 text-xs text-muted-foreground">
                  <span>Set</span>
                  <span>Reps</span>
                  <span>Weight (lb)</span>
                  <span className="text-center">Done</span>
                  <span />
                </div>
              )}
              {ex.sets.map((s, i) => (
                <div key={s.key} className="grid grid-cols-[2rem_1fr_1fr_2rem_2rem] items-center gap-2">
                  <span className="text-sm tabular-nums text-muted-foreground">{i + 1}</span>
                  <Input
                    type="number"
                    inputMode="numeric"
                    min={0}
                    value={s.reps}
                    onChange={(e) => patchSet(ex.key, s.key, { reps: e.target.value })}
                    aria-label={`Set ${i + 1} reps`}
                  />
                  <Input
                    type="number"
                    inputMode="decimal"
                    min={0}
                    step="any"
                    value={s.weight}
                    onChange={(e) => patchSet(ex.key, s.key, { weight: e.target.value })}
                    placeholder="0"
                    aria-label={`Set ${i + 1} weight`}
                  />
                  <div className="flex justify-center">
                    <Checkbox
                      checked={s.done}
                      onCheckedChange={(v) => patchSet(ex.key, s.key, { done: v === true })}
                      aria-label={`Set ${i + 1} done`}
                    />
                  </div>
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    className="h-8 w-8"
                    onClick={() =>
                      patchExercise(ex.key, (x) => ({ ...x, sets: x.sets.filter((y) => y.key !== s.key) }))
                    }
                    aria-label={`Remove set ${i + 1}`}
                  >
                    <X className="h-4 w-4" />
                  </Button>
                </div>
              ))}
              <Button type="button" variant="ghost" size="sm" onClick={() => addSet(ex.key)}>
                <Plus className="mr-1 h-4 w-4" />
                Add set
              </Button>
            </div>
          );
        })}

        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={() => setExercises((es) => [...es, { key: k++, name: "", sets: [setRow()] }])}
        >
          <Plus className="mr-1 h-4 w-4" />
          Add exercise
        </Button>
      </div>

      <div className="space-y-1">
        <Label htmlFor="log-notes">Notes</Label>
        <Textarea
          id="log-notes"
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          placeholder="How did it go?"
          rows={2}
        />
      </div>

      {error && <p className="text-sm text-destructive">{error}</p>}

      <div className="flex justify-end gap-2">
        <Button type="button" variant="outline" onClick={onCancel} disabled={loading}>
          Cancel
        </Button>
        <Button type="submit" disabled={loading}>
          {loading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
          Save log
        </Button>
      </div>
    </form>
  );
}
