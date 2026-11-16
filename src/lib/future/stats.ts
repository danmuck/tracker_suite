import type { Listing, ListingStatus, Tour } from "../../types/future/apartments";
import { LISTING_STATUSES } from "./validators";

/** Share of gross monthly income the rent guide line sits at */
export const RENT_GUIDE_SHARE = 0.3;

/** Cities match regardless of case and surrounding spaces */
export const cityKey = (city: string) => city.trim().toLowerCase();

/**
 * Distinct cities, A to Z. When spellings differ only by case, the most used
 * one is shown; a tie goes to the spelling with capitals first ("Boston" over "boston").
 */
export function cityNames(listings: Pick<Listing, "city">[]): string[] {
  const spellings = new Map<string, Map<string, number>>();
  for (const l of listings) {
    const name = l.city.trim();
    if (!name) continue;
    const counts = spellings.get(cityKey(name)) ?? new Map<string, number>();
    counts.set(name, (counts.get(name) ?? 0) + 1);
    spellings.set(cityKey(name), counts);
  }
  return [...spellings.values()]
    .map((counts) => [...counts].sort((a, b) => b[1] - a[1] || (a[0] < b[0] ? -1 : 1))[0][0])
    .sort((a, b) => a.localeCompare(b));
}

/** Listings still in the running: everything except rejected */
export function activeListings<T extends Pick<Listing, "status">>(listings: T[]): T[] {
  return listings.filter((l) => l.status !== "rejected");
}

export interface CityStat {
  city: string;
  count: number;
  /** Cents */
  avg: number;
  min: number;
  max: number;
}

/** Rent count, average and range per city, cheapest average first */
export function cityStats(listings: Pick<Listing, "city" | "rent">[]): CityStat[] {
  const names = cityNames(listings);
  return names
    .map((city) => {
      const rents = listings.filter((l) => cityKey(l.city) === cityKey(city)).map((l) => l.rent);
      return {
        city,
        count: rents.length,
        avg: Math.round(rents.reduce((a, b) => a + b, 0) / rents.length),
        min: Math.min(...rents),
        max: Math.max(...rents),
      };
    })
    .sort((a, b) => a.avg - b.avg || a.city.localeCompare(b.city));
}

/** Count per status in pipeline order, skipping statuses with no listings */
export function statusCounts(listings: Pick<Listing, "status">[]): { status: ListingStatus; count: number }[] {
  return LISTING_STATUSES.map((status) => ({
    status,
    count: listings.filter((l) => l.status === status).length,
  })).filter((s) => s.count > 0);
}

/** Monthly rent as a fraction of gross monthly income; null without a salary */
export function rentShare(rentCents: number, annualSalaryCents: number | undefined): number | null {
  if (!annualSalaryCents || annualSalaryCents <= 0) return null;
  return rentCents / (annualSalaryCents / 12);
}

/** Monthly rent at the guide share of gross income, in cents; null without a salary */
export function rentGuide(annualSalaryCents: number | undefined): number | null {
  if (!annualSalaryCents || annualSalaryCents <= 0) return null;
  return Math.round((annualSalaryCents / 12) * RENT_GUIDE_SHARE);
}

/** Cents per square foot per month; null when the size is unknown */
export function pricePerSqft(rentCents: number, sqft: number | undefined): number | null {
  if (!sqft || sqft <= 0) return null;
  return Math.round(rentCents / sqft);
}

export const COMPARE_METRICS = ["rent", "pricePerSqft", "sqft", "beds", "baths", "commuteMinutes", "rating"] as const;
export type CompareMetric = (typeof COMPARE_METRICS)[number];

const LOWER_IS_BETTER: Record<CompareMetric, boolean> = {
  rent: true,
  pricePerSqft: true,
  sqft: false,
  beds: false,
  baths: false,
  commuteMinutes: true,
  rating: false,
};

type Comparable = Pick<Listing, "_id" | "rent" | "sqft" | "beds" | "baths" | "commuteMinutes" | "rating">;

export function metricValue(l: Comparable, metric: CompareMetric): number | null {
  if (metric === "pricePerSqft") return pricePerSqft(l.rent, l.sqft);
  return l[metric] ?? null;
}

/**
 * Ids of the listings that win each metric. Ties all win; a metric where
 * fewer than two listings have a value, or every value is equal, has no winner.
 */
export function compareBest(listings: Comparable[]): Record<CompareMetric, string[]> {
  const out = {} as Record<CompareMetric, string[]>;
  for (const metric of COMPARE_METRICS) {
    const rows = listings
      .map((l) => ({ id: l._id, value: metricValue(l, metric) }))
      .filter((r): r is { id: string; value: number } => r.value !== null);
    const values = rows.map((r) => r.value);
    if (rows.length < 2 || Math.min(...values) === Math.max(...values)) {
      out[metric] = [];
      continue;
    }
    const best = LOWER_IS_BETTER[metric] ? Math.min(...values) : Math.max(...values);
    out[metric] = rows.filter((r) => r.value === best).map((r) => r.id);
  }
  return out;
}

const tourOrder = (a: Pick<Tour, "date" | "time">, b: Pick<Tour, "date" | "time">) =>
  a.date.localeCompare(b.date) || (a.time ?? "").localeCompare(b.time ?? "");

/** Upcoming (today onward, soonest first) and past (latest first) */
export function splitTours<T extends Pick<Tour, "date" | "time">>(tours: T[], today: string) {
  return {
    upcoming: tours.filter((t) => t.date >= today).sort(tourOrder),
    past: tours.filter((t) => t.date < today).sort((a, b) => tourOrder(b, a)),
  };
}
