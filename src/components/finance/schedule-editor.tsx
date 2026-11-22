"use client";

import { useState } from "react";
import { format } from "date-fns";
import { CalendarIcon, Plus, X } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Calendar } from "@/components/ui/calendar";
import { Input } from "@/components/ui/input";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { formatCurrency, formatDate, parseDate } from "@/lib/finance/formatters";
import { hourlyToAnnual } from "@/lib/finance/datasheet";
import { cn } from "@/lib/utils";

/**
 * "money" and "salary" values are cents ("salary" can be typed per hour);
 * "percent" values are fractions (0.06).
 */
export type ScheduleValueMode = "money" | "percent" | "salary";

export interface ScheduleEditorEntry {
  effectiveDate: string;
  value: number;
  source?: "rap";
}

interface Props {
  entries: ScheduleEditorEntry[];
  valueMode: ScheduleValueMode;
  unit?: string;
  onAdd: (date: string, value: number) => void;
  onRemove: (date: string) => void;
  hoursPerWeek?: number;
  disabled?: boolean;
  /** Highlight entries below this many cents (e.g. a minimum payment) */
  warnBelow?: number | null;
  emptyLabel?: string;
}

function display(mode: ScheduleValueMode, value: number) {
  return mode === "percent" ? `${+(value * 100).toFixed(2)}%` : formatCurrency(value);
}

function AddEntry({
  valueMode,
  hoursPerWeek = 40,
  existingDates,
  onAdd,
  disabled,
}: {
  valueMode: ScheduleValueMode;
  hoursPerWeek?: number;
  existingDates: string[];
  onAdd: (date: string, value: number) => void;
  disabled?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [date, setDate] = useState<Date>(new Date());
  const [value, setValue] = useState("");
  const [per, setPer] = useState<"year" | "hour">("year");
  const dateStr = format(date, "yyyy-MM-dd");
  const duplicate = existingDates.includes(dateStr);
  const num = Number(value);
  const valid = value !== "" && !isNaN(num) && num >= 0 && !(valueMode === "percent" && num > 100);

  function submit() {
    if (!valid || duplicate) return;
    const cents = Math.round(num * 100);
    const stored =
      valueMode === "percent"
        ? num / 100
        : valueMode === "salary" && per === "hour"
          ? hourlyToAnnual(cents, hoursPerWeek)
          : cents;
    onAdd(dateStr, stored);
    setValue("");
    setOpen(false);
  }

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button variant="outline" size="sm" className="h-7 gap-1 px-2" disabled={disabled}>
          <Plus className="h-3.5 w-3.5" /> Add
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-auto space-y-3 p-3" align="start">
        <Calendar mode="single" selected={date} defaultMonth={date} onSelect={(d) => d && setDate(d)} />
        <div className="flex items-center gap-2">
          <span className="text-sm text-muted-foreground">{valueMode === "percent" ? "%" : "$"}</span>
          <Input
            autoFocus
            type="number"
            step="0.01"
            min="0"
            className="h-8 w-32"
            value={value}
            onChange={(e) => setValue(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && submit()}
            placeholder={valueMode === "percent" ? "6" : "0.00"}
          />
          {valueMode === "salary" && (
            <Select value={per} onValueChange={(v) => setPer(v as "year" | "hour")}>
              <SelectTrigger className="h-8 w-28">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="year">per year</SelectItem>
                <SelectItem value="hour">per hour</SelectItem>
              </SelectContent>
            </Select>
          )}
        </div>
        {duplicate && <p className="text-xs text-destructive">There is already a change on this date.</p>}
        <Button size="sm" className="w-full" disabled={!valid || duplicate} onClick={submit}>
          <CalendarIcon className="mr-1 h-3.5 w-3.5" /> Add from {formatDate(dateStr)}
        </Button>
      </PopoverContent>
    </Popover>
  );
}

/** Dated values as removable chips plus an Add popover. Generated (RAP) entries are tagged and not removable. */
export function ScheduleEditor({
  entries,
  valueMode,
  unit = "",
  onAdd,
  onRemove,
  hoursPerWeek,
  disabled,
  warnBelow,
  emptyLabel = "None",
}: Props) {
  const sorted = [...entries].sort((a, b) => a.effectiveDate.localeCompare(b.effectiveDate));
  return (
    <div className="flex flex-wrap items-center gap-2">
      {sorted.length === 0 && <span className="text-sm text-muted-foreground">{emptyLabel}</span>}
      {sorted.map((e) => {
        const low = warnBelow != null && valueMode !== "percent" && e.value < warnBelow;
        return (
          <span
            key={e.effectiveDate}
            className={cn(
              "inline-flex items-center gap-1.5 rounded-md border bg-muted/40 px-2 py-0.5 text-sm",
              low && "border-amber-500/60 bg-amber-500/10"
            )}
            title={low ? "Below the minimum payment" : undefined}
          >
            <span className="text-muted-foreground">{format(parseDate(e.effectiveDate), "MMM d, yyyy")}</span>
            <span className="font-medium tabular-nums">
              {display(valueMode, e.value)}
              <span className="text-muted-foreground">{unit}</span>
            </span>
            {e.source === "rap" ? (
              <Badge variant="secondary" className="h-4 px-1 text-[10px]" title="Calculated from prior-year income">
                RAP
              </Badge>
            ) : (
              <button
                type="button"
                aria-label={`Remove change on ${e.effectiveDate}`}
                className="text-muted-foreground hover:text-destructive disabled:opacity-50"
                disabled={disabled}
                onClick={() => onRemove(e.effectiveDate)}
              >
                <X className="h-3.5 w-3.5" />
              </button>
            )}
          </span>
        );
      })}
      <AddEntry
        valueMode={valueMode}
        hoursPerWeek={hoursPerWeek}
        existingDates={sorted.filter((e) => !e.source).map((e) => e.effectiveDate)}
        onAdd={onAdd}
        disabled={disabled}
      />
    </div>
  );
}
