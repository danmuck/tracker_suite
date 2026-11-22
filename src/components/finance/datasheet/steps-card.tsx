"use client";

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { ScheduleEditor, type ScheduleValueMode } from "@/components/finance/schedule-editor";
import type { FinanceProfileData } from "@/types/finance/datasheet";

type StepKey = "salarySteps" | "retirementSteps" | "healthSteps" | "rentSteps";

const KINDS: { key: StepKey; label: string; field: string; unit: string; mode: ScheduleValueMode }[] = [
  { key: "salarySteps", label: "Salary", field: "annualGross", unit: "/yr", mode: "salary" },
  { key: "retirementSteps", label: "401(k)", field: "percent", unit: "", mode: "percent" },
  { key: "healthSteps", label: "Health", field: "perPaycheck", unit: "/check", mode: "money" },
  { key: "rentSteps", label: "Rent", field: "monthly", unit: "/mo", mode: "money" },
];

type Step = { effectiveDate: string } & Record<string, number | string>;

export function StepsCard({
  profile,
  onChange,
}: {
  profile: FinanceProfileData;
  onChange: (patch: Partial<FinanceProfileData>) => void;
}) {
  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Changes over time</CardTitle>
        <CardDescription>
          Each change applies to the first paycheck or rent payment on or after its date.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-3">
        {KINDS.map(({ key, label, field, unit, mode }) => {
          const steps = profile[key] as unknown as Step[];
          return (
            <div key={key} className="flex flex-wrap items-center gap-2 border-b pb-3 last:border-0 last:pb-0">
              <span className="w-16 text-sm font-medium">{label}</span>
              <ScheduleEditor
                entries={steps.map((s) => ({ effectiveDate: s.effectiveDate, value: s[field] as number }))}
                valueMode={mode}
                unit={unit}
                hoursPerWeek={profile.hoursPerWeek}
                onAdd={(effectiveDate, value) =>
                  onChange({ [key]: [...steps, { effectiveDate, [field]: value }] } as Partial<FinanceProfileData>)
                }
                onRemove={(date) =>
                  onChange({ [key]: steps.filter((s) => s.effectiveDate !== date) } as Partial<FinanceProfileData>)
                }
              />
            </div>
          );
        })}
      </CardContent>
    </Card>
  );
}
