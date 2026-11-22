"use client";

import { ChartBlock, Headline, ModuleCard, StatRow, StatRows } from "@/components/dashboard/module-card";
import { HBarList } from "@/components/dashboard/spark";
import { useFutureSettings } from "@/hooks/future/use-future-settings";
import { useListings } from "@/hooks/future/use-listings";
import { useTours } from "@/hooks/future/use-tours";
import { formatDay, formatRent, formatTime, todayDay } from "@/lib/future/format";
import { activeListings, cityStats, rentGuide, splitTours, statusCounts } from "@/lib/future/stats";
import { STATUS_LABELS } from "@/lib/future/validators";
import { modules } from "@/lib/modules";

const MAX_CITIES = 4;
const color = modules.find((m) => m.id === "future")!.accentColor;

export function FutureCard() {
  const { listings, isLoading: listingsLoading } = useListings();
  const { tours, isLoading: toursLoading } = useTours();
  const { settings } = useFutureSettings();

  const active = activeListings(listings);
  const rents = active.map((l) => l.rent);
  const avg = rents.length ? Math.round(rents.reduce((a, b) => a + b, 0) / rents.length) : null;
  const cities = cityStats(active).slice(0, MAX_CITIES);
  const maxAvg = Math.max(...cities.map((c) => c.avg), 1);
  const pipeline = statusCounts(active)
    .map((s) => `${s.count} ${STATUS_LABELS[s.status].toLowerCase()}`)
    .join(" · ");
  const next = splitTours(tours, todayDay()).upcoming[0];
  const nextListing = next && listings.find((l) => l._id === next.listingId);
  const guide = rentGuide(settings.annualSalary);
  const underGuide = guide === null ? 0 : active.filter((l) => l.rent <= guide).length;

  return (
    <ModuleCard moduleId="future" href="/future/apartments" isLoading={listingsLoading || toursLoading}>
      <Headline
        label="Average rent"
        value={avg !== null ? formatRent(avg) : "No listings yet"}
        sub={`${active.length} active listing${active.length !== 1 ? "s" : ""}`}
      />

      {cities.length > 0 && (
        <ChartBlock caption="Average rent by city, cheapest first">
          <HBarList
            color={color}
            rows={cities.map((c) => ({
              key: c.city,
              label: c.city,
              fraction: c.avg / maxAvg,
              value: formatRent(c.avg),
            }))}
          />
        </ChartBlock>
      )}

      <StatRows>
        {rents.length > 0 && (
          <StatRow
            label="Rent range"
            value={`${formatRent(Math.min(...rents))} – ${formatRent(Math.max(...rents))}`}
            href="/future/apartments?tab=listings"
          />
        )}
        {pipeline && <StatRow label="Pipeline" value={pipeline} href="/future/apartments?tab=listings" />}
        <StatRow
          label="Next tour"
          value={
            next
              ? [nextListing?.name, formatDay(next.date, "EEE, MMM d"), next.time && formatTime(next.time)]
                  .filter(Boolean)
                  .join(" · ")
              : "None scheduled"
          }
          href="/future/apartments?tab=tours"
        />
        {guide !== null && (
          <StatRow label="30% rent guide" value={`${formatRent(guide)} · ${underGuide} of ${active.length} under`} />
        )}
      </StatRows>
    </ModuleCard>
  );
}
