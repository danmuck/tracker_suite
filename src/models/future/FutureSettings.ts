import mongoose, { Schema, Document, Model } from "mongoose";
import { SETTINGS_RECORD_KEY } from "@/lib/future/validators";

export interface IFutureSettings extends Document {
  ownerId?: string;
  key: string;
  /** Gross annual salary in cents */
  annualSalary?: number;
  commuteDestination?: string;
}

const FutureSettingsSchema = new Schema<IFutureSettings>(
  {
    ownerId: { type: String },
    key: { type: String, required: true, default: SETTINGS_RECORD_KEY },
    annualSalary: { type: Number, min: 1 },
    commuteDestination: { type: String, trim: true },
  },
  { timestamps: true }
);

FutureSettingsSchema.index({ ownerId: 1, key: 1 }, { unique: true });

if (process.env.NODE_ENV !== "production" && mongoose.models.FutureSettings) {
  delete mongoose.models.FutureSettings;
}

const FutureSettings: Model<IFutureSettings> =
  mongoose.models.FutureSettings ||
  mongoose.model<IFutureSettings>("FutureSettings", FutureSettingsSchema);

export default FutureSettings;
