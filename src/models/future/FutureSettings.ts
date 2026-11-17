import mongoose, { Schema, Document, Model } from "mongoose";
import { SETTINGS_RECORD_KEY } from "@/lib/future/validators";

export interface IFutureSettings extends Document {
  key: string;
  /** Gross annual salary in cents */
  annualSalary?: number;
  commuteDestination?: string;
}

const FutureSettingsSchema = new Schema<IFutureSettings>(
  {
    key: { type: String, required: true, unique: true, default: SETTINGS_RECORD_KEY },
    annualSalary: { type: Number, min: 1 },
    commuteDestination: { type: String, trim: true },
  },
  { timestamps: true }
);

if (process.env.NODE_ENV !== "production" && mongoose.models.FutureSettings) {
  delete mongoose.models.FutureSettings;
}

const FutureSettings: Model<IFutureSettings> =
  mongoose.models.FutureSettings ||
  mongoose.model<IFutureSettings>("FutureSettings", FutureSettingsSchema);

export default FutureSettings;
