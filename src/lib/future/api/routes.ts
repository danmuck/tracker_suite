// Route table for the Future API, dispatched against a Store.
// Pure: no framework, browser or server imports.

import type { RouteDef } from "@/lib/data/api";
import {
  createListing,
  createTour,
  deleteListing,
  deleteTour,
  getSettings,
  listListings,
  listTours,
  saveSettings,
  updateListing,
  updateListingStatus,
  updateTour,
} from "./handlers";

export const futureRoutes: RouteDef[] = [
  { method: "GET", path: "/api/future/listings", handler: listListings, failure: "Failed to fetch listings" },
  { method: "POST", path: "/api/future/listings", handler: createListing, failure: "Failed to create listing" },
  { method: "PUT", path: "/api/future/listings/:listingId", handler: updateListing, failure: "Failed to update listing" },
  { method: "PATCH", path: "/api/future/listings/:listingId", handler: updateListingStatus, failure: "Failed to update status" },
  { method: "DELETE", path: "/api/future/listings/:listingId", handler: deleteListing, failure: "Failed to delete listing" },
  { method: "GET", path: "/api/future/tours", handler: listTours, failure: "Failed to fetch tours" },
  { method: "POST", path: "/api/future/tours", handler: createTour, failure: "Failed to schedule tour" },
  { method: "PUT", path: "/api/future/tours/:tourId", handler: updateTour, failure: "Failed to update tour" },
  { method: "DELETE", path: "/api/future/tours/:tourId", handler: deleteTour, failure: "Failed to delete tour" },
  { method: "GET", path: "/api/future/settings", handler: getSettings, failure: "Failed to fetch settings" },
  { method: "PUT", path: "/api/future/settings", handler: saveSettings, failure: "Failed to save settings" },
];
