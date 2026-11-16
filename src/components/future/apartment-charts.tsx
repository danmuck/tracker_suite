"use client";

import { Bar, BarChart, CartesianGrid, ReferenceLine, XAxis, YAxis } from "recharts";
import { ChartContainer, ChartTooltip, ChartTooltipContent, type ChartConfig } from "@/components/ui/chart";
import { formatMoney, formatPercent, formatRent } from "@/lib/future/format";
import { pricePerSqft, rentShare, type CityStat } from "@/lib/future/stats";
import { STATUS_LABELS } from "@/lib/future/validators";
import type { Listing, ListingStatus } from "@/types/future/apartments";

/**
 * Rent is always --chart-1 (the module accent); listing counts are --chart-3.
 * Each chart plots one series, so the card title names it and no legend is needed.
 */
const RENT_COLOR = "var(--chart-1)";
const COUNT_COLOR = "var(--chart-3)";

const axisProps = {
  tickLine: false,
  axisLine: false,
  tickMargin: 8,
  fontSize: 12,
} as const;

const compactDollars = new Intl.NumberFormat("en-US", {
  style: "currency",
  currency: "USD",
  notation: "compact",
  maximumFractionDigits: 1,
});

const shorten = (s: string, max = 20) => (s.length > max ? `${s.slice(0, max - 1)}…` : s);

/** One row per bar keeps long listing names readable */
const rowsHeight = (n: number) => Math.max(160, n * 34 + 40);

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between gap-4">
      <span className="text-muted-foreground">{label}</span>
      <span className="font-medium tabular-nums">{value}</span>
    </div>
  );
}

/** Monthly rent per listing, cheapest at the top, with the income guide line when a salary is set */
export function RentByListingChart({
  listings,
  annualSalary,
  guide,
}: {
  listings: Listing[];
  annualSalary?: number;
  /** Rent at the guide share of income, in cents */
  guide: number | null;
}) {
  const config: ChartConfig = { rent: { label: "Rent", color: RENT_COLOR } };
  const data = listings
    .slice()
    .sort((a, b) => a.rent - b.rent)
    .map((l) => ({ id: l._id, name: l.name, city: l.city, rent: l.rent / 100, cents: l.rent }));
  const top = Math.max(...data.map((d) => d.rent), guide ? guide / 100 : 0);

  return (
    <ChartContainer config={config} className="aspect-auto w-full" style={{ height: rowsHeight(data.length) }}>
      <BarChart data={data} layout="vertical" margin={{ left: 4, right: 16, top: 16 }}>
        <CartesianGrid horizontal={false} strokeOpacity={0.5} />
        <XAxis
          type="number"
          {...axisProps}
          domain={[0, Math.ceil((top * 1.05) / 100) * 100]}
          tickFormatter={(v) => compactDollars.format(v)}
        />
        <YAxis type="category" dataKey="id" {...axisProps} width={140} tickFormatter={(id) => shorten(data.find((d) => d.id === id)?.name ?? "")} />
        <ChartTooltip
          cursor={{ fillOpacity: 0.3 }}
          content={
            <ChartTooltipContent
              labelFormatter={(_, payload) => {
                const p = payload?.[0]?.payload;
                return p ? `${p.name} · ${p.city}` : "";
              }}
              formatter={(_value, _name, item) => {
                const share = rentShare(item.payload.cents, annualSalary);
                return (
                  <div className="grid w-full gap-0.5">
                    <Row label="Rent" value={`${formatRent(item.payload.cents)} / mo`} />
                    {share !== null && <Row label="Share of income" value={formatPercent(share)} />}
                  </div>
                );
              }}
            />
          }
        />
        <Bar dataKey="rent" fill="var(--color-rent)" radius={[0, 4, 4, 0]} maxBarSize={22} />
        {guide !== null && (
          <ReferenceLine
            x={guide / 100}
            stroke="var(--foreground)"
            strokeDasharray="4 4"
            strokeOpacity={0.6}
            label={{ value: "30% of income", position: "top", fontSize: 11, fill: "var(--muted-foreground)" }}
          />
        )}
      </BarChart>
    </ChartContainer>
  );
}

/** Average rent per city; the tooltip gives the range and how many listings it covers */
export function CityRentChart({ stats }: { stats: CityStat[] }) {
  const config: ChartConfig = { avg: { label: "Average rent", color: RENT_COLOR } };
  const data = stats.map((s) => ({ ...s, avg: s.avg / 100, avgCents: s.avg }));
  return (
    <ChartContainer config={config} className="aspect-auto h-56 w-full">
      <BarChart data={data} margin={{ left: -4, right: 4, top: 8 }}>
        <CartesianGrid vertical={false} strokeOpacity={0.5} />
        <XAxis dataKey="city" {...axisProps} tickFormatter={(c) => shorten(c, 14)} />
        <YAxis {...axisProps} width={52} tickFormatter={(v) => compactDollars.format(v)} />
        <ChartTooltip
          cursor={{ fillOpacity: 0.3 }}
          content={
            <ChartTooltipContent
              formatter={(_value, _name, item) => (
                <div className="grid w-full gap-0.5">
                  <Row label="Average" value={formatRent(item.payload.avgCents)} />
                  <Row label="Range" value={`${formatRent(item.payload.min)} – ${formatRent(item.payload.max)}`} />
                  <Row label="Listings" value={String(item.payload.count)} />
                </div>
              )}
            />
          }
        />
        <Bar dataKey="avg" fill="var(--color-avg)" radius={[4, 4, 0, 0]} maxBarSize={48} />
      </BarChart>
    </ChartContainer>
  );
}

/** Rent per square foot for listings with a known size, best value at the top */
export function PricePerSqftChart({ listings }: { listings: Listing[] }) {
  const config: ChartConfig = { ppsf: { label: "Per sq ft", color: RENT_COLOR } };
  const data = listings
    .flatMap((l) => {
      const cents = pricePerSqft(l.rent, l.sqft);
      return cents === null ? [] : [{ id: l._id, name: l.name, city: l.city, sqft: l.sqft!, ppsf: cents / 100, cents }];
    })
    .sort((a, b) => a.ppsf - b.ppsf);

  return (
    <ChartContainer config={config} className="aspect-auto w-full" style={{ height: rowsHeight(data.length) }}>
      <BarChart data={data} layout="vertical" margin={{ left: 4, right: 16, top: 8 }}>
        <CartesianGrid horizontal={false} strokeOpacity={0.5} />
        <XAxis type="number" {...axisProps} tickFormatter={(v) => `$${v}`} />
        <YAxis type="category" dataKey="id" {...axisProps} width={140} tickFormatter={(id) => shorten(data.find((d) => d.id === id)?.name ?? "")} />
        <ChartTooltip
          cursor={{ fillOpacity: 0.3 }}
          content={
            <ChartTooltipContent
              labelFormatter={(_, payload) => {
                const p = payload?.[0]?.payload;
                return p ? `${p.name} · ${p.city}` : "";
              }}
              formatter={(_value, _name, item) => (
                <div className="grid w-full gap-0.5">
                  <Row label="Per sq ft" value={`${formatMoney(item.payload.cents)} / mo`} />
                  <Row label="Size" value={`${item.payload.sqft.toLocaleString("en-US")} sq ft`} />
                </div>
              )}
            />
          }
        />
        <Bar dataKey="ppsf" fill="var(--color-ppsf)" radius={[0, 4, 4, 0]} maxBarSize={22} />
      </BarChart>
    </ChartContainer>
  );
}

/** How many listings sit at each step of the pipeline */
export function StatusChart({ counts }: { counts: { status: ListingStatus; count: number }[] }) {
  const config: ChartConfig = { count: { label: "Listings", color: COUNT_COLOR } };
  const data = counts.map((c) => ({ ...c, label: STATUS_LABELS[c.status] }));
  return (
    <ChartContainer config={config} className="aspect-auto h-56 w-full">
      <BarChart data={data} margin={{ left: -12, right: 4, top: 8 }}>
        <CartesianGrid vertical={false} strokeOpacity={0.5} />
        <XAxis dataKey="label" {...axisProps} />
        <YAxis {...axisProps} width={44} allowDecimals={false} />
        <ChartTooltip
          cursor={{ fillOpacity: 0.3 }}
          content={
            <ChartTooltipContent
              formatter={(value) => (
                <div className="w-full">
                  <Row label="Listings" value={String(value)} />
                </div>
              )}
            />
          }
        />
        <Bar dataKey="count" fill="var(--color-count)" radius={[4, 4, 0, 0]} maxBarSize={48} />
      </BarChart>
    </ChartContainer>
  );
}
