"use client";

import { useState } from "react";
import { CalendarIcon, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Calendar } from "@/components/ui/calendar";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { RUN_TYPES } from "@/lib/figure/validators";
import {
  formatDay,
  formatDuration,
  formatPace,
  fromDay,
  parseDuration,
  parseOptionalNumber,
  toDay,
} from "@/lib/figure/format";
import type { RunLog, RunLogFormData, RunType } from "@/types/figure/fitness";

export const RUN_TYPE_LABELS: Record<RunType, string> = {
  easy: "Easy",
  tempo: "Tempo",
  intervals: "Intervals",
  long: "Long",
  race: "Race",
  other: "Other",
};

interface RunFormProps {
  defaultDate: string;
  defaultValues?: RunLog;
  onSubmit: (data: RunLogFormData) => Promise<void>;
  onCancel?: () => void;
}

export function RunForm({ defaultDate, defaultValues, onSubmit, onCancel }: RunFormProps) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [date, setDate] = useState(defaultValues?.date ?? defaultDate);
  const [dateOpen, setDateOpen] = useState(false);
  const [distance, setDistance] = useState(defaultValues ? String(defaultValues.distance) : "");
  const [time, setTime] = useState(defaultValues ? formatDuration(defaultValues.durationSeconds) : "");
  const [type, setType] = useState<RunType>(defaultValues?.type ?? "easy");
  const [notes, setNotes] = useState(defaultValues?.notes ?? "");

  const miles = parseOptionalNumber(distance);
  const seconds = parseDuration(time);
  const pace = miles && seconds ? formatPace(seconds, miles) : null;

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!miles || miles <= 0) return setError("Enter a distance in miles");
    if (!seconds) return setError("Enter time as mm:ss or h:mm:ss (a plain number means minutes)");
    setError(null);
    setLoading(true);
    try {
      await onSubmit({ date, distance: miles, durationSeconds: seconds, type, notes: notes.trim() || undefined });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to save");
    } finally {
      setLoading(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <div className="grid gap-3 sm:grid-cols-2">
        <div className="space-y-1">
          <Label>Date</Label>
          <Popover open={dateOpen} onOpenChange={setDateOpen}>
            <PopoverTrigger asChild>
              <Button type="button" variant="outline" className="w-full justify-start">
                <CalendarIcon className="mr-2 h-4 w-4" />
                {formatDay(date, "MMM d, yyyy")}
              </Button>
            </PopoverTrigger>
            <PopoverContent className="w-auto p-0" align="start">
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
        <div className="space-y-1">
          <Label htmlFor="run-type">Type</Label>
          <Select value={type} onValueChange={(v) => setType(v as RunType)}>
            <SelectTrigger id="run-type" className="w-full">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {RUN_TYPES.map((t) => (
                <SelectItem key={t} value={t}>
                  {RUN_TYPE_LABELS[t]}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-1">
          <Label htmlFor="run-distance">Distance (mi)</Label>
          <Input
            id="run-distance"
            type="number"
            inputMode="decimal"
            min={0}
            step="any"
            value={distance}
            onChange={(e) => setDistance(e.target.value)}
            placeholder="3.1"
            autoFocus
          />
        </div>
        <div className="space-y-1">
          <Label htmlFor="run-time">Time</Label>
          <Input
            id="run-time"
            value={time}
            onChange={(e) => setTime(e.target.value)}
            placeholder="27:45"
            inputMode="numeric"
          />
        </div>
      </div>

      <p className="text-sm text-muted-foreground">
        Pace: <span className="font-medium tabular-nums text-foreground">{pace ?? "—"}</span>
      </p>

      <div className="space-y-1">
        <Label htmlFor="run-notes">Notes</Label>
        <Textarea
          id="run-notes"
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          placeholder="Route, how it felt…"
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
          {defaultValues ? "Save" : "Log run"}
        </Button>
      </div>
    </form>
  );
}
