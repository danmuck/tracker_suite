"use client";

import { Check, ExternalLink, Scale, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { EmptyState } from "@/components/empty-state";
import { LoadingState } from "@/components/loading-state";
import { useQueryParam } from "@/hooks/use-query-param";
import { formatBeds, formatDay, formatMoney, formatPercent, formatRent } from "@/lib/future/format";
import { compareBest, pricePerSqft, rentShare, type CompareMetric } from "@/lib/future/stats";
import { AMENITIES, AMENITY_LABELS, STATUS_LABELS } from "@/lib/future/validators";
import { cn } from "@/lib/utils";
import type { Listing } from "@/types/future/apartments";

interface ComparePanelProps {
  listings: Listing[];
  isLoading: boolean;
  annualSalary?: number;
  commuteDestination?: string;
  onNew: () => void;
}

const MAX = 4;

interface Row {
  label: string;
  /** Metric whose winners are highlighted on this row */
  metric?: CompareMetric;
  render: (l: Listing) => React.ReactNode;
}

const dash = "—";

/** Side-by-side view of up to four listings; the selection lives in ?compare= */
export function ComparePanel({ listings, isLoading, annualSalary, commuteDestination, onNew }: ComparePanelProps) {
  const [param, setParam] = useQueryParam("compare");

  if (isLoading) return <LoadingState variant="table" />;
  if (listings.length === 0) {
    return (
      <EmptyState
        icon={Scale}
        title="Nothing to compare yet"
        description="Add at least two listings, then line them up here."
        action={{ label: "Add listing", onClick: onNew }}
      />
    );
  }

  // Ids of deleted listings drop out on their own
  const picked = (param ?? "")
    .split(",")
    .map((id) => listings.find((l) => l._id === id))
    .filter((l): l is Listing => !!l)
    .filter((l, i, all) => all.indexOf(l) === i)
    .slice(0, MAX);
  const setPicked = (next: Listing[]) => setParam(next.length ? next.map((l) => l._id).join(",") : null);
  const available = listings.filter((l) => !picked.includes(l));
  const best = compareBest(picked);

  const rows: Row[] = [
    { label: "Rent", metric: "rent", render: (l) => `${formatRent(l.rent)} / mo` },
    ...(annualSalary
      ? [
          {
            label: "Share of income",
            metric: "rent" as const,
            render: (l: Listing) => formatPercent(rentShare(l.rent, annualSalary) ?? 0),
          },
        ]
      : []),
    { label: "City", render: (l) => l.city },
    { label: "Neighborhood", render: (l) => l.neighborhood ?? dash },
    { label: "Bedrooms", metric: "beds", render: (l) => formatBeds(l.beds) },
    { label: "Bathrooms", metric: "baths", render: (l) => l.baths ?? dash },
    { label: "Size", metric: "sqft", render: (l) => (l.sqft ? `${l.sqft.toLocaleString("en-US")} sq ft` : dash) },
    {
      label: "Per sq ft",
      metric: "pricePerSqft",
      render: (l) => {
        const cents = pricePerSqft(l.rent, l.sqft);
        return cents === null ? dash : formatMoney(cents);
      },
    },
    {
      label: commuteDestination ? `Commute to ${commuteDestination}` : "Commute",
      metric: "commuteMinutes",
      render: (l) => (l.commuteMinutes !== undefined ? `${l.commuteMinutes} min` : dash),
    },
    { label: "Available", render: (l) => (l.availableDate ? formatDay(l.availableDate) : dash) },
    { label: "Lease", render: (l) => (l.leaseMonths ? `${l.leaseMonths} months` : dash) },
    ...AMENITIES.map((a) => ({
      label: AMENITY_LABELS[a],
      render: (l: Listing) =>
        l.amenities.includes(a) ? (
          <Check className="h-4 w-4" aria-label="Yes" />
        ) : (
          <span className="text-muted-foreground" aria-label="No">
            {dash}
          </span>
        ),
    })),
    { label: "Rating", metric: "rating", render: (l) => (l.rating ? `${l.rating} / 5` : dash) },
    { label: "Status", render: (l) => STATUS_LABELS[l.status] },
  ];

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-3">
        {picked.length < MAX && available.length > 0 && (
          <Select key={picked.length} onValueChange={(id) => setPicked([...picked, listings.find((l) => l._id === id)!])}>
            <SelectTrigger className="w-64" aria-label="Add a listing to compare">
              <SelectValue placeholder="Add a listing to compare…" />
            </SelectTrigger>
            <SelectContent>
              {available.map((l) => (
                <SelectItem key={l._id} value={l._id}>
                  {l.name} · {l.city} · {formatRent(l.rent)}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        )}
        <p className="text-sm text-muted-foreground">
          {picked.length === 0
            ? `Pick up to ${MAX} listings.`
            : picked.length === 1
              ? "Add one more to see which comes out ahead."
              : "The best value in each row is highlighted."}
        </p>
      </div>

      {picked.length > 0 && (
        <div className="rounded-lg border">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-40" />
                {picked.map((l) => (
                  <TableHead key={l._id} className="min-w-40 py-2 align-top">
                    <div className="flex items-start justify-between gap-2">
                      {l.url ? (
                        <a
                          href={l.url}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="inline-flex items-center gap-1 whitespace-normal font-medium text-foreground underline-offset-4 hover:underline"
                        >
                          {l.name}
                          <ExternalLink className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
                        </a>
                      ) : (
                        <span className="whitespace-normal font-medium text-foreground">{l.name}</span>
                      )}
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-6 w-6 shrink-0"
                        onClick={() => setPicked(picked.filter((p) => p !== l))}
                        aria-label={`Remove ${l.name} from comparison`}
                      >
                        <X className="h-3.5 w-3.5" />
                      </Button>
                    </div>
                  </TableHead>
                ))}
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.map((row) => (
                <TableRow key={row.label}>
                  <TableCell className="text-muted-foreground">{row.label}</TableCell>
                  {picked.map((l) => {
                    const wins = !!row.metric && best[row.metric].includes(l._id);
                    return (
                      <TableCell key={l._id} className={cn("tabular-nums", wins && "bg-primary/10 font-semibold")}>
                        {row.render(l)}
                      </TableCell>
                    );
                  })}
                </TableRow>
              ))}
              <TableRow>
                <TableCell className="align-top text-muted-foreground">Notes</TableCell>
                {picked.map((l) => (
                  <TableCell key={l._id} className="whitespace-pre-wrap align-top text-sm">
                    {l.notes ?? dash}
                  </TableCell>
                ))}
              </TableRow>
            </TableBody>
          </Table>
        </div>
      )}
    </div>
  );
}
