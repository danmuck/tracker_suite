// Future API logic as store-backed handlers, shared by the server and browser data modes.
// Pure: no framework, browser or server imports.

import { escapeRegex, fail, invalid, isId, notFound, ok, setAndUnset, type Handler } from "@/lib/data/api";
import type { BaseDoc, Collection, Store } from "@/lib/data/store";
import {
  LISTING_OPTIONAL_FIELDS,
  LISTING_STATUSES,
  SETTINGS_RECORD_KEY,
  listingSchema,
  listingStatusSchema,
  settingsSchema,
  tourSchema,
} from "@/lib/future/validators";
import type { FutureSettings, Listing, Tour } from "@/types/future/apartments";

type SettingsDoc = FutureSettings & BaseDoc & { key: string };

const LISTING = "Listing";
const TOUR = "Tour";
const SETTINGS_OPTIONAL_FIELDS = ["annualSalary", "commuteDestination"] as const;
const TOUR_OPTIONAL_FIELDS = ["time", "notes"] as const;
const LIST_LIMIT = 1000;

const listings = (store: Store): Collection<Listing> => store.collection<Listing>("listings");
const tours = (store: Store): Collection<Tour> => store.collection<Tour>("tours");
const settings = (store: Store): Collection<SettingsDoc> => store.collection<SettingsDoc>("futureSettings");

const settingsBody = (doc: FutureSettings | null) => ({
  annualSalary: doc?.annualSalary,
  commuteDestination: doc?.commuteDestination,
});

/** A tour must point at a listing that exists; returns the 400 response when it does not */
async function missingListing(store: Store, listingId: string) {
  if (isId(listingId) && (await listings(store).exists({ _id: listingId }))) return null;
  return fail(400, "That listing no longer exists");
}

export const listListings: Handler = async ({ store, query }) => {
  const filter: Record<string, unknown> = {};
  const city = query.get("city")?.trim();
  if (city) filter.city = { $regex: `^${escapeRegex(city)}$`, $options: "i" };
  const status = query.get("status");
  if (status && (LISTING_STATUSES as readonly string[]).includes(status)) filter.status = status;
  return ok(await listings(store).find(filter, { sort: { rent: 1, createdAt: -1 }, limit: LIST_LIMIT }));
};

export const createListing: Handler = async ({ store, body }) => {
  const parsed = listingSchema.safeParse(body);
  if (!parsed.success) return invalid(parsed.error);
  return ok(await listings(store).insert(parsed.data), 201);
};

/** Full replace: optional fields left out of the body are cleared */
export const updateListing: Handler = async ({ store, params, body }) => {
  if (!isId(params.listingId)) return notFound(LISTING);
  const parsed = listingSchema.safeParse(body);
  if (!parsed.success) return invalid(parsed.error);
  const updated = await listings(store).updateById(
    params.listingId,
    setAndUnset(parsed.data, LISTING_OPTIONAL_FIELDS),
  );
  return updated ? ok(updated) : notFound(LISTING);
};

/** Status-only change; leaves every other field alone */
export const updateListingStatus: Handler = async ({ store, params, body }) => {
  if (!isId(params.listingId)) return notFound(LISTING);
  const parsed = listingStatusSchema.safeParse(body);
  if (!parsed.success) return invalid(parsed.error);
  const updated = await listings(store).updateById(params.listingId, { $set: { status: parsed.data.status } });
  return updated ? ok(updated) : notFound(LISTING);
};

/** Deletes the listing and every tour scheduled for it */
export const deleteListing: Handler = async ({ store, params }) => {
  if (!isId(params.listingId)) return notFound(LISTING);
  const deleted = await listings(store).deleteById(params.listingId);
  if (!deleted) return notFound(LISTING);
  await tours(store).deleteMany({ listingId: params.listingId });
  return ok({ message: "Listing deleted" });
};

export const listTours: Handler = async ({ store }) =>
  ok(await tours(store).find({}, { sort: { date: 1, time: 1 }, limit: LIST_LIMIT }));

export const createTour: Handler = async ({ store, body }) => {
  const parsed = tourSchema.safeParse(body);
  if (!parsed.success) return invalid(parsed.error);
  const { listingId } = parsed.data;
  const missing = await missingListing(store, listingId);
  if (missing) return missing;
  return ok(await tours(store).insert(parsed.data), 201);
};

export const updateTour: Handler = async ({ store, params, body }) => {
  if (!isId(params.tourId)) return notFound(TOUR);
  const parsed = tourSchema.safeParse(body);
  if (!parsed.success) return invalid(parsed.error);
  const { listingId } = parsed.data;
  const missing = await missingListing(store, listingId);
  if (missing) return missing;
  const updated = await tours(store).updateById(params.tourId, setAndUnset(parsed.data, TOUR_OPTIONAL_FIELDS));
  return updated ? ok(updated) : notFound(TOUR);
};

export const deleteTour: Handler = async ({ store, params }) => {
  if (!isId(params.tourId)) return notFound(TOUR);
  const deleted = await tours(store).deleteById(params.tourId);
  return deleted ? ok({ message: "Tour deleted" }) : notFound(TOUR);
};

export const getSettings: Handler = async ({ store }) =>
  ok(settingsBody(await settings(store).findOne({ key: SETTINGS_RECORD_KEY })));

/** Full replace: a field left out of the body is cleared */
export const saveSettings: Handler = async ({ store, body }) => {
  const parsed = settingsSchema.safeParse(body);
  if (!parsed.success) return invalid(parsed.error);
  await settings(store).updateOne(
    { key: SETTINGS_RECORD_KEY },
    setAndUnset(parsed.data, SETTINGS_OPTIONAL_FIELDS),
    { upsert: true },
  );
  return ok(settingsBody(await settings(store).findOne({ key: SETTINGS_RECORD_KEY })));
};
