import { z } from "zod";

export const LISTING_STATUSES = ["saved", "contacted", "toured", "applied", "rejected", "signed"] as const;
export const AMENITIES = ["laundry", "parking", "pets", "ac", "dishwasher", "outdoor"] as const;

export const STATUS_LABELS: Record<(typeof LISTING_STATUSES)[number], string> = {
  saved: "Saved",
  contacted: "Contacted",
  toured: "Toured",
  applied: "Applied",
  rejected: "Rejected",
  signed: "Signed",
};

export const AMENITY_LABELS: Record<(typeof AMENITIES)[number], string> = {
  laundry: "In-unit laundry",
  parking: "Parking",
  pets: "Pets allowed",
  ac: "Air conditioning",
  dishwasher: "Dishwasher",
  outdoor: "Outdoor space",
};

const day = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Date must be yyyy-MM-dd");
const text = (max: number) => z.string().trim().max(max).optional();

/** Optional listing fields; a PUT that omits one clears it */
export const LISTING_OPTIONAL_FIELDS = [
  "url",
  "address",
  "neighborhood",
  "beds",
  "baths",
  "sqft",
  "availableDate",
  "leaseMonths",
  "rating",
  "notes",
  "commuteMinutes",
  "contactName",
  "contactPhone",
  "contactEmail",
] as const;

export const listingSchema = z.object({
  name: z.string().trim().min(1, "Name is required").max(200),
  city: z.string().trim().min(1, "City is required").max(100),
  /** Monthly rent in cents */
  rent: z.number().int().positive("Rent must be more than 0").max(100_000_000),
  status: z.enum(LISTING_STATUSES).default("saved"),
  amenities: z.array(z.enum(AMENITIES)).default([]),
  url: z
    .string()
    .trim()
    .max(2000)
    .regex(/^https?:\/\/\S+$/i, "Link must start with http:// or https://")
    .optional(),
  address: text(300),
  neighborhood: text(100),
  beds: z.number().int().min(0).max(20).optional(),
  baths: z.number().min(0).max(20).optional(),
  sqft: z.number().int().positive().max(100_000).optional(),
  availableDate: day.optional(),
  leaseMonths: z.number().int().positive().max(120).optional(),
  rating: z.number().int().min(1).max(5).optional(),
  notes: text(5000),
  commuteMinutes: z.number().int().min(0).max(600).optional(),
  contactName: text(200),
  contactPhone: text(50),
  contactEmail: z.string().trim().max(200).email("Enter a valid email").optional(),
});

/** Status-only change from the listings table */
export const listingStatusSchema = z.object({ status: z.enum(LISTING_STATUSES) });

export const tourSchema = z.object({
  listingId: z.string().min(1, "Pick a listing"),
  date: day,
  time: z
    .string()
    .regex(/^([01]\d|2[0-3]):[0-5]\d$/, "Time must be HH:mm")
    .optional(),
  notes: text(5000),
});

/** The fixed key of the one settings document */
export const SETTINGS_RECORD_KEY = "default";

export const settingsSchema = z.object({
  /** Gross annual salary in cents */
  annualSalary: z.number().int().positive().max(100_000_000_000).optional(),
  commuteDestination: text(200),
});
