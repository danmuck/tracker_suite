"use client";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { formatCurrency } from "@/lib/finance/formatters";
import type { FinanceProfileData } from "@/types/finance/datasheet";
import type { Transaction } from "@/types/finance/transaction";

const FILING_LABELS: Record<FinanceProfileData["filingStatus"], string> = {
  single: "Single",
  married_jointly: "Married filing jointly",
  married_separately: "Married filing separately",
  head_of_household: "Head of household",
};

const NONE = "__none__";

interface Props {
  profile: FinanceProfileData;
  onChange: (patch: Partial<FinanceProfileData>) => void;
  recurring: Transaction[];
  payCycleLabel: string;
}

function TxSelect({
  id,
  value,
  options,
  onChange,
}: {
  id: string;
  value: string | null | undefined;
  options: Transaction[];
  onChange: (id: string | null) => void;
}) {
  return (
    <Select value={value || NONE} onValueChange={(v) => onChange(v === NONE ? null : v)}>
      <SelectTrigger id={id} className="w-full">
        <SelectValue placeholder="Not linked" />
      </SelectTrigger>
      <SelectContent>
        <SelectItem value={NONE}>Not linked</SelectItem>
        {options.map((t) => (
          <SelectItem key={t._id} value={t._id}>
            {t.description} · {formatCurrency(t.amount)} · {t.recurrenceRule?.frequency.replace("_", "-")}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}

export function SettingsCard({ profile, onChange, recurring, payCycleLabel }: Props) {
  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Settings</CardTitle>
      </CardHeader>
      <CardContent className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <div className="space-y-1">
          <Label htmlFor="filing">Filing status</Label>
          <Select
            value={profile.filingStatus}
            onValueChange={(v) => onChange({ filingStatus: v as FinanceProfileData["filingStatus"] })}
          >
            <SelectTrigger id="filing" className="w-full">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {Object.entries(FILING_LABELS).map(([value, label]) => (
                <SelectItem key={value} value={value}>
                  {label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-1">
          <Label htmlFor="hours">Hours per week</Label>
          <Input
            id="hours"
            type="number"
            min={1}
            max={80}
            value={profile.hoursPerWeek}
            onChange={(e) => onChange({ hoursPerWeek: Number(e.target.value) || 0 })}
          />
        </div>
        <div className="space-y-1">
          <Label htmlFor="nyc">NYC resident tax</Label>
          <div className="flex h-9 items-center gap-2">
            <Switch id="nyc" checked={profile.nycResident} onCheckedChange={(v) => onChange({ nycResident: v })} />
            <span className="text-sm text-muted-foreground">{profile.nycResident ? "On" : "Off"}</span>
          </div>
        </div>
        <div className="space-y-1">
          <Label>Pay cycle</Label>
          <p className="flex h-9 items-center text-sm text-muted-foreground">{payCycleLabel}</p>
        </div>
        <div className="space-y-1 sm:col-span-2">
          <Label htmlFor="salary-tx">Salary transaction</Label>
          <TxSelect
            id="salary-tx"
            value={profile.salaryTransactionId}
            options={recurring.filter((t) => t.type === "credit")}
            onChange={(id) => onChange({ salaryTransactionId: id })}
          />
        </div>
        <div className="space-y-1 sm:col-span-2">
          <Label htmlFor="rent-tx">Rent transaction</Label>
          <TxSelect
            id="rent-tx"
            value={profile.rentTransactionId}
            options={recurring.filter((t) => t.type === "debit")}
            onChange={(id) => onChange({ rentTransactionId: id })}
          />
        </div>
      </CardContent>
    </Card>
  );
}
