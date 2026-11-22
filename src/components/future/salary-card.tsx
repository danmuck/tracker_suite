"use client";

import { useState } from "react";
import { Loader2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { centsToDollars, dollarsToCents, formatRent, parseOptionalNumber } from "@/lib/future/format";
import { rentGuide } from "@/lib/future/stats";
import type { FutureSettings } from "@/types/future/apartments";

interface SalaryCardProps {
  settings: FutureSettings;
  onSave: (next: FutureSettings) => Promise<void>;
}

/** Salary and commute destination: the two numbers listings are measured against */
export function SalaryCard({ settings, onSave }: SalaryCardProps) {
  const [salary, setSalary] = useState(settings.annualSalary ? String(centsToDollars(settings.annualSalary)) : "");
  const [destination, setDestination] = useState(settings.commuteDestination ?? "");
  const [saving, setSaving] = useState(false);

  const guide = rentGuide(settings.annualSalary);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const amount = parseOptionalNumber(salary);
    if (salary.trim() !== "" && (!amount || amount <= 0)) {
      toast.error("Enter your salary as a number, or leave it blank");
      return;
    }
    setSaving(true);
    try {
      await onSave({
        annualSalary: amount ? dollarsToCents(amount) : undefined,
        commuteDestination: destination.trim() || undefined,
      });
      toast.success("Saved");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to save");
    } finally {
      setSaving(false);
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Affordability</CardTitle>
        <CardDescription>
          Enter your salary to see each rent as a share of your income. It stays in this module.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <form onSubmit={handleSubmit} className="flex flex-wrap items-end gap-3">
          <div className="space-y-1">
            <Label htmlFor="future-salary">Salary ($ / year, before tax)</Label>
            <Input
              id="future-salary"
              type="number"
              inputMode="decimal"
              min={0}
              step="any"
              value={salary}
              onChange={(e) => setSalary(e.target.value)}
              placeholder="85000"
              className="w-48"
            />
          </div>
          <div className="space-y-1">
            <Label htmlFor="future-destination">Commute to</Label>
            <Input
              id="future-destination"
              value={destination}
              onChange={(e) => setDestination(e.target.value)}
              placeholder="Office"
              className="w-48"
            />
          </div>
          <Button type="submit" variant="outline" disabled={saving}>
            {saving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            Save
          </Button>
          {guide !== null && settings.annualSalary && (
            <p className="basis-full text-sm text-muted-foreground">
              {formatRent(Math.round(settings.annualSalary / 12))} a month before tax. 30% of that is{" "}
              <span className="font-medium text-foreground">{formatRent(guide)}</span>, a common upper guide for rent.
            </p>
          )}
        </form>
      </CardContent>
    </Card>
  );
}
