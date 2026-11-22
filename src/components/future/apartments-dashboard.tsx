"use client";

import { Building2 } from "lucide-react";
import { ChartCard } from "@/components/chart-card";
import { EmptyState } from "@/components/empty-state";
import { LoadingState } from "@/components/loading-state";
import { StatTile } from "@/components/stat-tile";
import {
  CityRentChart,
  PricePerSqftChart,
  RentByListingChart,
  StatusChart,
} from "@/components/future/apartment-charts";
import { SalaryCard } from "@/components/future/salary-card";
import { formatDay, formatPercent, formatRent, formatTime, todayDay } from "@/lib/future/format";
import { activeListings, cityStats, rentGuide, rentShare, splitTours, statusCounts } from "@/lib/future/stats";
import type { FutureSettings, Listing, Tour } from "@/types/future/apartments";

interface ApartmentsDashboardProps {
  listings: Listing[];
  tours: Tour[];
  settings: FutureSettings;
  isLoading: boolean;
  onNew: () => void;
  onSaveSettings: (next: FutureSettings) => Promise<void>;
}

/** Price comparison across listings and cities. Rejected listings are left out of every figure. */
export function ApartmentsDashboard({
  listings,
  tours,
  settings,
  isLoading,
  onNew,
  onSaveSettings,
}: ApartmentsDashboardProps) {
  if (isLoading) return <LoadingState variant="chart" />;

  const active = activeListings(listings);
  const salary = settings.annualSalary;
  const guide = rentGuide(salary);
  // Remount the card when saved values change so its inputs pick them up
  const salaryCard = (
    <SalaryCard
      key={`${salary ?? ""}|${settings.commuteDestination ?? ""}`}
      settings={settings}
      onSave={onSaveSettings}
    />
  );

  if (active.length === 0) {
    return (
      <div className="space-y-6">
        {salaryCard}
        <EmptyState
          icon={Building2}
          title={listings.length ? "Every listing is rejected" : "No listings yet"}
          description="Add a few apartments and their rents will be compared here."
          action={{ label: "Add listing", onClick: onNew }}
        />
      </div>
    );
  }

  const rents = active.map((l) => l.rent);
  const avg = Math.round(rents.reduce((a, b) => a + b, 0) / rents.length);
  const cheapest = active.reduce((a, b) => (b.rent < a.rent ? b : a));
  const cities = cityStats(active);
  const withSize = active.filter((l) => l.sqft);
  const next = splitTours(tours, todayDay()).upcoming[0];
  const nextListing = next && listings.find((l) => l._id === next.listingId);
  const avgShare = rentShare(avg, salary);
  const underGuide = guide === null ? null : active.filter((l) => l.rent <= guide).length;

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        <StatTile
          label="Active listings"
          value={String(active.length)}
          sub={`${cities.length} cit${cities.length !== 1 ? "ies" : "y"}${
            listings.length > active.length ? ` · ${listings.length - active.length} rejected` : ""
          }`}
        />
        <StatTile
          label="Average rent"
          value={formatRent(avg)}
          sub={avgShare !== null ? `${formatPercent(avgShare)} of income` : "per month"}
        />
        <StatTile label="Lowest rent" value={formatRent(cheapest.rent)} sub={`${cheapest.name} · ${cheapest.city}`} />
        {underGuide !== null ? (
          <StatTile
            label="Within 30% of income"
            value={`${underGuide} of ${active.length}`}
            sub={`at or under ${formatRent(guide!)}`}
          />
        ) : (
          <StatTile
            label="Next tour"
            value={next ? formatDay(next.date, "MMM d") : "None"}
            sub={next ? nextListing?.name ?? "Deleted listing" : "Schedule one from a listing"}
          />
        )}
      </div>

      {underGuide !== null && next && (
        <p className="text-sm text-muted-foreground">
          Next tour: <span className="font-medium text-foreground">{nextListing?.name ?? "Deleted listing"}</span>,{" "}
          {formatDay(next.date, "EEE, MMM d")}
          {next.time && ` at ${formatTime(next.time)}`}
        </p>
      )}

      {salaryCard}

      <ChartCard
        title="Rent by listing"
        description={
          guide !== null
            ? "Monthly rent, cheapest first. The dashed line is 30% of your income."
            : "Monthly rent, cheapest first"
        }
      >
        <RentByListingChart listings={active} annualSalary={salary} guide={guide} />
      </ChartCard>

      <div className="grid gap-6 lg:grid-cols-2">
        <ChartCard title="Average rent by city" description="Hover a bar for the range and listing count">
          <CityRentChart stats={cities} />
        </ChartCard>

        <ChartCard title="Listings by status" description="Where each listing is in your search, rejected included">
          <StatusChart counts={statusCounts(listings)} />
        </ChartCard>
      </div>

      <ChartCard title="Price per square foot" description="Monthly rent ÷ size, best value first">
        {withSize.length > 0 ? (
          <PricePerSqftChart listings={withSize} />
        ) : (
          <p className="py-10 text-center text-sm text-muted-foreground">
            Add a size in sq ft to a listing to compare value.
          </p>
        )}
      </ChartCard>
    </div>
  );
}
