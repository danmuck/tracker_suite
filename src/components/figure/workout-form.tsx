"use client";

import { useState } from "react";
import { Loader2, Plus, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { ExerciseNameInput } from "@/components/figure/exercise-name-input";
import { parseOptionalNumber } from "@/lib/figure/format";
import type { Workout, WorkoutFormData } from "@/types/figure/fitness";

interface Row {
  key: number;
  name: string;
  sets: string;
  reps: string;
  weight: string;
}

let rowKey = 0;
const blankRow = (): Row => ({ key: rowKey++, name: "", sets: "3", reps: "10", weight: "" });

interface WorkoutFormProps {
  defaultValues?: Workout;
  onSubmit: (data: WorkoutFormData) => Promise<void>;
  onCancel?: () => void;
}

export function WorkoutForm({ defaultValues, onSubmit, onCancel }: WorkoutFormProps) {
  const [loading, setLoading] = useState(false);
  const [name, setName] = useState(defaultValues?.name ?? "");
  const [notes, setNotes] = useState(defaultValues?.notes ?? "");
  const [rows, setRows] = useState<Row[]>(() =>
    defaultValues?.exercises.length
      ? defaultValues.exercises.map((e) => ({
          key: rowKey++,
          name: e.name,
          sets: String(e.targetSets),
          reps: String(e.targetReps),
          weight: e.targetWeight !== undefined ? String(e.targetWeight) : "",
        }))
      : [blankRow()]
  );
  const [error, setError] = useState<string | null>(null);

  function updateRow(key: number, patch: Partial<Row>) {
    setRows((rs) => rs.map((r) => (r.key === key ? { ...r, ...patch } : r)));
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!name.trim()) return setError("Name is required");
    const exercises = rows
      .filter((r) => r.name.trim())
      .map((r) => ({
        name: r.name.trim(),
        targetSets: Math.max(1, Math.round(parseOptionalNumber(r.sets) ?? 1)),
        targetReps: Math.max(0, Math.round(parseOptionalNumber(r.reps) ?? 0)),
        targetWeight: parseOptionalNumber(r.weight),
      }));
    setError(null);
    setLoading(true);
    try {
      await onSubmit({ name: name.trim(), notes: notes.trim() || undefined, exercises });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to save");
    } finally {
      setLoading(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <div className="space-y-1">
        <Label htmlFor="workout-name">Name</Label>
        <Input
          id="workout-name"
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="e.g. Push Day"
          autoFocus
        />
      </div>

      <div className="space-y-2">
        <div className="grid grid-cols-[1fr_4rem_4rem_5rem_2rem] gap-2 text-xs text-muted-foreground">
          <span>Exercise</span>
          <span>Sets</span>
          <span>Reps</span>
          <span>Weight (lb)</span>
          <span />
        </div>
        {rows.map((r) => (
          <div key={r.key} className="grid grid-cols-[1fr_4rem_4rem_5rem_2rem] gap-2">
            <ExerciseNameInput
              value={r.name}
              onChange={(e) => updateRow(r.key, { name: e.target.value })}
              aria-label="Exercise name"
            />
            <Input
              type="number"
              inputMode="numeric"
              min={1}
              value={r.sets}
              onChange={(e) => updateRow(r.key, { sets: e.target.value })}
              aria-label="Target sets"
            />
            <Input
              type="number"
              inputMode="numeric"
              min={0}
              value={r.reps}
              onChange={(e) => updateRow(r.key, { reps: e.target.value })}
              aria-label="Target reps"
            />
            <Input
              type="number"
              inputMode="decimal"
              min={0}
              step="any"
              value={r.weight}
              onChange={(e) => updateRow(r.key, { weight: e.target.value })}
              placeholder="—"
              aria-label="Target weight"
            />
            <Button
              type="button"
              variant="ghost"
              size="icon"
              onClick={() => setRows((rs) => rs.filter((x) => x.key !== r.key))}
              aria-label="Remove exercise"
            >
              <Trash2 className="h-4 w-4" />
            </Button>
          </div>
        ))}
        <Button type="button" variant="outline" size="sm" onClick={() => setRows((rs) => [...rs, blankRow()])}>
          <Plus className="mr-1 h-4 w-4" />
          Add exercise
        </Button>
      </div>

      <div className="space-y-1">
        <Label htmlFor="workout-notes">Notes</Label>
        <Textarea
          id="workout-notes"
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          placeholder="Optional"
          rows={2}
        />
      </div>

      {error && <p className="text-sm text-destructive">{error}</p>}

      <div className="flex justify-end gap-2">
        {onCancel && (
          <Button type="button" variant="outline" onClick={onCancel} disabled={loading}>
            Cancel
          </Button>
        )}
        <Button type="submit" disabled={loading}>
          {loading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
          {defaultValues ? "Save" : "Create workout"}
        </Button>
      </div>
    </form>
  );
}
