import mongoose, { Schema, Document, Model } from "mongoose";
import { AMENITIES, LISTING_STATUSES } from "@/lib/future/validators";

export interface IListing extends Document {
  name: string;
  city: string;
  /** Monthly rent in cents */
  rent: number;
  status: (typeof LISTING_STATUSES)[number];
  amenities: (typeof AMENITIES)[number][];
  url?: string;
  address?: string;
  neighborhood?: string;
  /** 0 means studio */
  beds?: number;
  baths?: number;
  sqft?: number;
  /** Calendar day, yyyy-MM-dd */
  availableDate?: string;
  leaseMonths?: number;
  rating?: number;
  notes?: string;
  commuteMinutes?: number;
  contactName?: string;
  contactPhone?: string;
  contactEmail?: string;
  createdAt: Date;
  updatedAt: Date;
}

const ListingSchema = new Schema<IListing>(
  {
    name: { type: String, required: true, trim: true },
    city: { type: String, required: true, trim: true },
    rent: { type: Number, required: true, min: 1 },
    status: { type: String, required: true, enum: [...LISTING_STATUSES], default: "saved" },
    amenities: { type: [String], enum: [...AMENITIES], default: [] },
    url: { type: String, trim: true },
    address: { type: String, trim: true },
    neighborhood: { type: String, trim: true },
    beds: { type: Number, min: 0 },
    baths: { type: Number, min: 0 },
    sqft: { type: Number, min: 1 },
    availableDate: { type: String, match: /^\d{4}-\d{2}-\d{2}$/ },
    leaseMonths: { type: Number, min: 1 },
    rating: { type: Number, min: 1, max: 5 },
    notes: { type: String, trim: true },
    commuteMinutes: { type: Number, min: 0 },
    contactName: { type: String, trim: true },
    contactPhone: { type: String, trim: true },
    contactEmail: { type: String, trim: true },
  },
  { timestamps: true }
);

ListingSchema.index({ city: 1, rent: 1 });

if (process.env.NODE_ENV !== "production" && mongoose.models.Listing) {
  delete mongoose.models.Listing;
}

const Listing: Model<IListing> =
  mongoose.models.Listing || mongoose.model<IListing>("Listing", ListingSchema);

export default Listing;
