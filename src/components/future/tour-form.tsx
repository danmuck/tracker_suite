"use client";

import { useState } from "react";
import { Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { todayDay } from "@/lib/future/format";
import type { Listing, Tour, TourFormData } from "@/types/future/apartments";

interface TourFormProps {
  listings: Listing[];
  /** Preselected listing when scheduling from a listing's row */
  defaultListingId?: string;
  defaultValues?: Tour;
  onSubmit: (data: TourFormData) => Promise<void>;
  onCancel?: () => void;
}

export function TourForm({ listings, defaultListingId, defaultValues, onSubmit, onCancel }: TourFormProps) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [listingId, setListingId] = useState(defaultValues?.listingId ?? defaultListingId ?? "");
  const [date, setDate] = useState(defaultValues?.date ?? todayDay());
  const [time, setTime] = useState(defaultValues?.time ?? "");
  const [notes, setNotes] = useState(defaultValues?.notes ?? "");

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!listingId) return setError("Pick a listing");
    if (!date) return setError("Pick a date");
    setError(null);
    setLoading(true);
    try {
      await onSubmit({ listingId, date, time: time || undefined, notes: notes.trim() || undefined });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to save");
    } finally {
      setLoading(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <div className="space-y-1">
        <Label htmlFor="tour-listing">Listing</Label>
        <Select value={listingId || undefined} onValueChange={setListingId}>
          <SelectTrigger id="tour-listing" className="w-full">
            <SelectValue placeholder="Pick a listing" />
          </SelectTrigger>
          <SelectContent>
            {listings.map((l) => (
              <SelectItem key={l._id} value={l._id}>
                {l.name} · {l.city}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <div className="grid gap-3 sm:grid-cols-2">
        <div className="space-y-1">
          <Label htmlFor="tour-date">Date</Label>
          <Input id="tour-date" type="date" value={date} onChange={(e) => setDate(e.target.value)} />
        </div>
        <div className="space-y-1">
          <Label htmlFor="tour-time">Time (optional)</Label>
          <Input id="tour-time" type="time" value={time} onChange={(e) => setTime(e.target.value)} />
        </div>
      </div>

      <div className="space-y-1">
        <Label htmlFor="tour-notes">Notes</Label>
        <Textarea
          id="tour-notes"
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          placeholder="Questions to ask, or what you thought afterwards…"
          rows={3}
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
          {defaultValues ? "Save" : "Schedule tour"}
        </Button>
      </div>
    </form>
  );
}
