"use client";

import { Suspense, useState } from "react";
import { CalendarPlus, Plus } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { PageHeader } from "@/components/page-header";
import { LoadingState } from "@/components/loading-state";
import { DeleteConfirmDialog } from "@/components/delete-confirm-dialog";
import { ApartmentsDashboard } from "@/components/future/apartments-dashboard";
import { ComparePanel } from "@/components/future/compare-panel";
import { ListingForm } from "@/components/future/listing-form";
import { ListingsPanel } from "@/components/future/listings-panel";
import { TourForm } from "@/components/future/tour-form";
import { ToursPanel } from "@/components/future/tours-panel";
import { saveFutureSettings, useFutureSettings } from "@/hooks/future/use-future-settings";
import {
  createListing,
  deleteListing,
  setListingStatus,
  updateListing,
  useListings,
} from "@/hooks/future/use-listings";
import { createTour, deleteTour, updateTour, useTours } from "@/hooks/future/use-tours";
import { useTabParam } from "@/hooks/use-tab-param";
import { cityNames } from "@/lib/future/stats";
import { STATUS_LABELS } from "@/lib/future/validators";
import type {
  FutureSettings,
  Listing,
  ListingFormData,
  ListingStatus,
  Tour,
  TourFormData,
} from "@/types/future/apartments";

const TABS = ["dashboard", "listings", "compare", "tours"] as const;

export default function ApartmentsPage() {
  return (
    <Suspense fallback={<LoadingState variant="cards" />}>
      <ApartmentsContent />
    </Suspense>
  );
}

/** Tour dialog state: a new tour (optionally for one listing) or an existing tour being edited */
type TourDialog = { listingId?: string; tour?: Tour } | null;

function ApartmentsContent() {
  const [tab, setTab] = useTabParam(TABS, "dashboard");

  const { listings, isLoading: listingsLoading, mutate: mutateListings } = useListings();
  const { tours, isLoading: toursLoading, mutate: mutateTours } = useTours();
  const { settings, isLoading: settingsLoading, mutate: mutateSettings } = useFutureSettings();

  const [listingFormOpen, setListingFormOpen] = useState(false);
  const [editingListing, setEditingListing] = useState<Listing | null>(null);
  const [deletingListing, setDeletingListing] = useState<Listing | null>(null);
  const [tourDialog, setTourDialog] = useState<TourDialog>(null);
  const [deletingTour, setDeletingTour] = useState<Tour | null>(null);

  const closeListingForm = () => {
    setListingFormOpen(false);
    setEditingListing(null);
  };

  async function saveListing(data: ListingFormData) {
    if (editingListing) {
      await updateListing(editingListing._id, data);
      toast.success("Listing updated");
    } else {
      await createListing(data);
      toast.success("Listing added");
    }
    closeListingForm();
    mutateListings();
  }

  async function changeStatus(listing: Listing, status: ListingStatus) {
    try {
      await setListingStatus(listing._id, status);
      toast.success(`${listing.name}: ${STATUS_LABELS[status]}`);
      mutateListings();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to update status");
    }
  }

  async function handleDeleteListing() {
    if (!deletingListing) return;
    await deleteListing(deletingListing._id);
    toast.success("Listing deleted");
    mutateListings();
    // Its tours were deleted with it
    mutateTours();
  }

  async function saveTour(data: TourFormData) {
    if (tourDialog?.tour) {
      await updateTour(tourDialog.tour._id, data);
      toast.success("Tour updated");
    } else {
      await createTour(data);
      toast.success("Tour scheduled");
    }
    setTourDialog(null);
    mutateTours();
  }

  async function handleDeleteTour() {
    if (!deletingTour) return;
    await deleteTour(deletingTour._id);
    toast.success("Tour deleted");
    mutateTours();
  }

  async function saveSettings(next: FutureSettings) {
    await saveFutureSettings(next);
    await mutateSettings();
  }

  const deletingTourCount = deletingListing ? tours.filter((t) => t.listingId === deletingListing._id).length : 0;

  return (
    <div className="space-y-6">
      <PageHeader
        title="Apartments"
        description="Collect listings, compare rents by city, and plan tours"
        action={
          tab === "tours" ? (
            <Button onClick={() => setTourDialog({})} disabled={listings.length === 0}>
              <CalendarPlus className="mr-2 h-4 w-4" />
              Schedule tour
            </Button>
          ) : (
            <Button onClick={() => setListingFormOpen(true)}>
              <Plus className="mr-2 h-4 w-4" />
              Add listing
            </Button>
          )
        }
      />

      <Tabs value={tab} onValueChange={setTab} className="gap-6">
        <TabsList variant="line" className="w-full justify-start border-b">
          <TabsTrigger value="dashboard" className="flex-none">
            Dashboard
          </TabsTrigger>
          <TabsTrigger value="listings" className="flex-none">
            Listings ({listings.length})
          </TabsTrigger>
          <TabsTrigger value="compare" className="flex-none">
            Compare
          </TabsTrigger>
          <TabsTrigger value="tours" className="flex-none">
            Tours ({tours.length})
          </TabsTrigger>
        </TabsList>

        <TabsContent value="dashboard">
          <ApartmentsDashboard
            listings={listings}
            tours={tours}
            settings={settings}
            isLoading={listingsLoading || toursLoading || settingsLoading}
            onNew={() => setListingFormOpen(true)}
            onSaveSettings={saveSettings}
          />
        </TabsContent>

        <TabsContent value="listings">
          <ListingsPanel
            listings={listings}
            isLoading={listingsLoading}
            annualSalary={settings.annualSalary}
            onNew={() => setListingFormOpen(true)}
            onEdit={setEditingListing}
            onDelete={setDeletingListing}
            onScheduleTour={(l) => setTourDialog({ listingId: l._id })}
            onStatusChange={changeStatus}
          />
        </TabsContent>

        <TabsContent value="compare">
          <ComparePanel
            listings={listings}
            isLoading={listingsLoading}
            annualSalary={settings.annualSalary}
            commuteDestination={settings.commuteDestination}
            onNew={() => setListingFormOpen(true)}
          />
        </TabsContent>

        <TabsContent value="tours">
          <ToursPanel
            tours={tours}
            listings={listings}
            isLoading={toursLoading || listingsLoading}
            onNew={() => setTourDialog({})}
            onEdit={(tour) => setTourDialog({ tour })}
            onDelete={setDeletingTour}
          />
        </TabsContent>
      </Tabs>

      <Dialog open={listingFormOpen || !!editingListing} onOpenChange={(o) => !o && closeListingForm()}>
        <DialogContent className="sm:max-w-2xl">
          <DialogHeader>
            <DialogTitle>{editingListing ? "Edit listing" : "Add listing"}</DialogTitle>
          </DialogHeader>
          <ListingForm
            key={editingListing?._id ?? "new"}
            cities={cityNames(listings)}
            commuteDestination={settings.commuteDestination}
            defaultValues={editingListing ?? undefined}
            onSubmit={saveListing}
            onCancel={closeListingForm}
          />
        </DialogContent>
      </Dialog>

      <Dialog open={!!tourDialog} onOpenChange={(o) => !o && setTourDialog(null)}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>{tourDialog?.tour ? "Edit tour" : "Schedule tour"}</DialogTitle>
          </DialogHeader>
          {tourDialog && (
            <TourForm
              key={tourDialog.tour?._id ?? tourDialog.listingId ?? "new"}
              listings={listings}
              defaultListingId={tourDialog.listingId}
              defaultValues={tourDialog.tour}
              onSubmit={saveTour}
              onCancel={() => setTourDialog(null)}
            />
          )}
        </DialogContent>
      </Dialog>

      <DeleteConfirmDialog
        open={!!deletingListing}
        onOpenChange={(o) => !o && setDeletingListing(null)}
        onConfirm={handleDeleteListing}
        title="Delete listing"
        description={
          deletingTourCount
            ? `This also deletes ${deletingTourCount} tour${deletingTourCount !== 1 ? "s" : ""} for it. This action cannot be undone.`
            : "This action cannot be undone."
        }
      />
      <DeleteConfirmDialog
        open={!!deletingTour}
        onOpenChange={(o) => !o && setDeletingTour(null)}
        onConfirm={handleDeleteTour}
        title="Delete tour"
        description="This removes the tour and its notes. This action cannot be undone."
      />
    </div>
  );
}
