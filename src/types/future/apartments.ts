import type { AMENITIES, LISTING_STATUSES } from "@/lib/future/validators";

export type ListingStatus = (typeof LISTING_STATUSES)[number];
export type Amenity = (typeof AMENITIES)[number];

export interface ListingFormData {
  name: string;
  city: string;
  /** Monthly rent in cents */
  rent: number;
  status: ListingStatus;
  amenities: Amenity[];
  url?: string;
  address?: string;
  neighborhood?: string;
  /** 0 means studio */
  beds?: number;
  baths?: number;
  sqft?: number;
  /** yyyy-MM-dd */
  availableDate?: string;
  leaseMonths?: number;
  /** 1 to 5 */
  rating?: number;
  notes?: string;
  commuteMinutes?: number;
  contactName?: string;
  contactPhone?: string;
  contactEmail?: string;
}

export interface Listing extends ListingFormData {
  _id: string;
  createdAt: string;
  updatedAt: string;
}

export interface TourFormData {
  listingId: string;
  /** yyyy-MM-dd */
  date: string;
  /** HH:mm, 24-hour */
  time?: string;
  notes?: string;
}

export interface Tour extends TourFormData {
  _id: string;
  createdAt: string;
  updatedAt: string;
}

export interface FutureSettings {
  /** Gross annual salary in cents */
  annualSalary?: number;
  commuteDestination?: string;
}
