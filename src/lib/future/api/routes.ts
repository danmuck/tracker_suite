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
  { method: "GET", path: "/api/future/listings", handler: listListings },
  { method: "POST", path: "/api/future/listings", handler: createListing },
  { method: "PUT", path: "/api/future/listings/:listingId", handler: updateListing },
  { method: "PATCH", path: "/api/future/listings/:listingId", handler: updateListingStatus },
  { method: "DELETE", path: "/api/future/listings/:listingId", handler: deleteListing },
  { method: "GET", path: "/api/future/tours", handler: listTours },
  { method: "POST", path: "/api/future/tours", handler: createTour },
  { method: "PUT", path: "/api/future/tours/:tourId", handler: updateTour },
  { method: "DELETE", path: "/api/future/tours/:tourId", handler: deleteTour },
  { method: "GET", path: "/api/future/settings", handler: getSettings },
  { method: "PUT", path: "/api/future/settings", handler: saveSettings },
];
