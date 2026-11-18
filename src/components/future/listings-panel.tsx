"use client";

import { useState } from "react";
import { ArrowDown, ArrowUp, Building2, CalendarPlus, ExternalLink, MoreHorizontal, Pencil, Star, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { EmptyState } from "@/components/empty-state";
import { LoadingState } from "@/components/loading-state";
import { useQueryParam } from "@/hooks/use-query-param";
import { formatBeds, formatPercent, formatRent } from "@/lib/future/format";
import { cityKey, cityNames, rentShare } from "@/lib/future/stats";
import { LISTING_STATUSES, STATUS_LABELS } from "@/lib/future/validators";
import { cn } from "@/lib/utils";
import { safeHref } from "@/lib/safe-url";
import type { Listing, ListingStatus } from "@/types/future/apartments";

interface ListingsPanelProps {
  listings: Listing[];
  isLoading: boolean;
  /** Gross annual salary in cents, when the user has entered one */
  annualSalary?: number;
  onNew: () => void;
  onEdit: (l: Listing) => void;
  onDelete: (l: Listing) => void;
  onScheduleTour: (l: Listing) => void;
  onStatusChange: (l: Listing, status: ListingStatus) => void;
}

const ALL = "all";

export function ListingsPanel({
  listings,
  isLoading,
  annualSalary,
  onNew,
  onEdit,
  onDelete,
  onScheduleTour,
  onStatusChange,
}: ListingsPanelProps) {
  const [cityParam, setCityParam] = useQueryParam("city");
  const [cheapestFirst, setCheapestFirst] = useState(true);

  if (isLoading) return <LoadingState variant="table" />;
  if (listings.length === 0) {
    return (
      <EmptyState
        icon={Building2}
        title="No listings yet"
        description="Add an apartment with its city, rent and link. A tab appears for each city you add."
        action={{ label: "Add listing", onClick: onNew }}
      />
    );
  }

  const cities = cityNames(listings);
  // An unknown or stale ?city= falls back to All
  const city = cities.find((c) => cityKey(c) === cityKey(cityParam ?? "")) ?? ALL;
  const inCity = (c: string) => listings.filter((l) => cityKey(l.city) === cityKey(c));
  const rows = (city === ALL ? listings : inCity(city))
    .slice()
    .sort((a, b) => (cheapestFirst ? a.rent - b.rent : b.rent - a.rent));

  return (
    <div className="space-y-4">
      <Tabs value={city} onValueChange={(v) => setCityParam(v === ALL ? null : v)}>
        <TabsList className="h-auto max-w-full flex-wrap justify-start">
          <TabsTrigger value={ALL}>All ({listings.length})</TabsTrigger>
          {cities.map((c) => (
            <TabsTrigger key={c} value={c}>
              {c} ({inCity(c).length})
            </TabsTrigger>
          ))}
        </TabsList>
      </Tabs>

      <div className="rounded-lg border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Listing</TableHead>
              {city === ALL && <TableHead>City</TableHead>}
              <TableHead className="text-right">
                <button
                  type="button"
                  onClick={() => setCheapestFirst((v) => !v)}
                  className="inline-flex items-center gap-1 hover:text-foreground"
                  aria-label={cheapestFirst ? "Sort rent high to low" : "Sort rent low to high"}
                >
                  Rent
                  {cheapestFirst ? <ArrowUp className="h-3.5 w-3.5" /> : <ArrowDown className="h-3.5 w-3.5" />}
                </button>
              </TableHead>
              <TableHead className="hidden sm:table-cell">Beds / baths</TableHead>
              <TableHead className="hidden text-right md:table-cell">Sq ft</TableHead>
              <TableHead>Status</TableHead>
              <TableHead className="hidden lg:table-cell">Rating</TableHead>
              <TableHead className="w-10" />
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows.map((l) => {
              const share = rentShare(l.rent, annualSalary);
              return (
                <TableRow key={l._id} className={cn(l.status === "rejected" && "text-muted-foreground")}>
                  <TableCell className="max-w-64">
                    {safeHref(l.url) ? (
                      <a
                        href={safeHref(l.url)}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="inline-flex max-w-full items-center gap-1 font-medium underline-offset-4 hover:underline"
                      >
                        <span className="truncate">{l.name}</span>
                        <ExternalLink className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
                      </a>
                    ) : (
                      <span className="block truncate font-medium">{l.name}</span>
                    )}
                    {l.neighborhood && (
                      <span className="block truncate text-xs text-muted-foreground">{l.neighborhood}</span>
                    )}
                  </TableCell>
                  {city === ALL && <TableCell className="whitespace-nowrap">{l.city}</TableCell>}
                  <TableCell className="text-right tabular-nums">
                    <span className={cn("font-medium", l.status === "rejected" && "line-through")}>
                      {formatRent(l.rent)}
                    </span>
                    {share !== null && (
                      <span className="block text-xs text-muted-foreground">{formatPercent(share)} of income</span>
                    )}
                  </TableCell>
                  <TableCell className="hidden whitespace-nowrap sm:table-cell">
                    {formatBeds(l.beds)}
                    {l.baths !== undefined && ` · ${l.baths} ba`}
                  </TableCell>
                  <TableCell className="hidden text-right tabular-nums md:table-cell">
                    {l.sqft ? l.sqft.toLocaleString("en-US") : "—"}
                  </TableCell>
                  <TableCell>
                    <Select value={l.status} onValueChange={(v) => onStatusChange(l, v as ListingStatus)}>
                      <SelectTrigger size="sm" className="w-32" aria-label={`Status of ${l.name}`}>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {LISTING_STATUSES.map((s) => (
                          <SelectItem key={s} value={s}>
                            {STATUS_LABELS[s]}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </TableCell>
                  <TableCell className="hidden lg:table-cell">
                    {l.rating ? (
                      <span className="inline-flex items-center gap-1 tabular-nums" aria-label={`${l.rating} out of 5`}>
                        <Star className="h-3.5 w-3.5 fill-current" />
                        {l.rating}
                      </span>
                    ) : (
                      "—"
                    )}
                  </TableCell>
                  <TableCell>
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <Button variant="ghost" size="icon" className="h-8 w-8" aria-label={`Actions for ${l.name}`}>
                          <MoreHorizontal className="h-4 w-4" />
                        </Button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end">
                        <DropdownMenuItem onClick={() => onEdit(l)}>
                          <Pencil className="mr-2 h-4 w-4" />
                          Edit
                        </DropdownMenuItem>
                        <DropdownMenuItem onClick={() => onScheduleTour(l)}>
                          <CalendarPlus className="mr-2 h-4 w-4" />
                          Schedule tour
                        </DropdownMenuItem>
                        <DropdownMenuItem onClick={() => onDelete(l)} className="text-destructive">
                          <Trash2 className="mr-2 h-4 w-4" />
                          Delete
                        </DropdownMenuItem>
                      </DropdownMenuContent>
                    </DropdownMenu>
                  </TableCell>
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}
