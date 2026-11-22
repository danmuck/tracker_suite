"use client";

import { CalendarDays, MoreHorizontal, Pencil, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { EmptyState } from "@/components/empty-state";
import { LoadingState } from "@/components/loading-state";
import { formatDay, formatTime, todayDay } from "@/lib/future/format";
import { splitTours } from "@/lib/future/stats";
import type { Listing, Tour } from "@/types/future/apartments";

interface ToursPanelProps {
  tours: Tour[];
  listings: Listing[];
  isLoading: boolean;
  onNew: () => void;
  onEdit: (t: Tour) => void;
  onDelete: (t: Tour) => void;
}

export function ToursPanel({ tours, listings, isLoading, onNew, onEdit, onDelete }: ToursPanelProps) {
  if (isLoading) return <LoadingState variant="cards" />;
  if (tours.length === 0) {
    return (
      <EmptyState
        icon={CalendarDays}
        title="No tours scheduled"
        description={
          listings.length
            ? "Schedule a viewing for one of your listings and keep your notes from it here."
            : "Add a listing first, then schedule a viewing for it."
        }
        action={listings.length ? { label: "Schedule tour", onClick: onNew } : undefined}
      />
    );
  }

  const byId = new Map(listings.map((l) => [l._id, l]));
  const { upcoming, past } = splitTours(tours, todayDay());

  const group = (title: string, items: Tour[]) =>
    items.length > 0 && (
      <section className="space-y-3">
        <h2 className="text-sm font-medium text-muted-foreground">
          {title} ({items.length})
        </h2>
        <div className="grid gap-3 md:grid-cols-2">
          {items.map((t) => {
            const listing = byId.get(t.listingId);
            return (
              <Card key={t._id} className="py-4">
                <CardContent className="flex items-start gap-3 px-4">
                  <div className="w-24 shrink-0">
                    <p className="text-sm font-medium">{formatDay(t.date, "EEE, MMM d")}</p>
                    <p className="text-xs tabular-nums text-muted-foreground">
                      {t.time ? formatTime(t.time) : "Time not set"}
                    </p>
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="truncate font-medium">{listing?.name ?? "Deleted listing"}</p>
                    {listing && (
                      <p className="truncate text-xs text-muted-foreground">
                        {[listing.address, listing.city].filter(Boolean).join(" · ")}
                      </p>
                    )}
                    {t.notes && <p className="mt-2 whitespace-pre-wrap text-sm text-muted-foreground">{t.notes}</p>}
                  </div>
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <Button variant="ghost" size="icon" className="h-8 w-8 shrink-0" aria-label="Tour actions">
                        <MoreHorizontal className="h-4 w-4" />
                      </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end">
                      <DropdownMenuItem onClick={() => onEdit(t)}>
                        <Pencil className="mr-2 h-4 w-4" />
                        Edit
                      </DropdownMenuItem>
                      <DropdownMenuItem onClick={() => onDelete(t)} className="text-destructive">
                        <Trash2 className="mr-2 h-4 w-4" />
                        Delete
                      </DropdownMenuItem>
                    </DropdownMenuContent>
                  </DropdownMenu>
                </CardContent>
              </Card>
            );
          })}
        </div>
      </section>
    );

  return (
    <div className="space-y-6">
      {group("Upcoming", upcoming)}
      {group("Past", past)}
    </div>
  );
}
