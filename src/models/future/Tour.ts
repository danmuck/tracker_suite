import mongoose, { Schema, Document, Model, Types } from "mongoose";

export interface ITour extends Document {
  listingId: Types.ObjectId;
  /** Calendar day, yyyy-MM-dd */
  date: string;
  /** HH:mm, 24-hour */
  time?: string;
  notes?: string;
  createdAt: Date;
  updatedAt: Date;
}

const TourSchema = new Schema<ITour>(
  {
    listingId: { type: Schema.Types.ObjectId, ref: "Listing", required: true, index: true },
    date: { type: String, required: true, match: /^\d{4}-\d{2}-\d{2}$/ },
    time: { type: String, match: /^([01]\d|2[0-3]):[0-5]\d$/ },
    notes: { type: String, trim: true },
  },
  { timestamps: true }
);

TourSchema.index({ date: 1 });

if (process.env.NODE_ENV !== "production" && mongoose.models.Tour) {
  delete mongoose.models.Tour;
}

const Tour: Model<ITour> = mongoose.models.Tour || mongoose.model<ITour>("Tour", TourSchema);

export default Tour;
