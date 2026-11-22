import mongoose, { Schema, Document, Model } from "mongoose";

export interface IRunLog extends Document {
  /** Calendar day, yyyy-MM-dd */
  date: string;
  /** Miles */
  distance: number;
  durationSeconds: number;
  type: "easy" | "tempo" | "intervals" | "long" | "race" | "other";
  notes?: string;
  createdAt: Date;
  updatedAt: Date;
}

const RunLogSchema = new Schema<IRunLog>(
  {
    date: { type: String, required: true, match: /^\d{4}-\d{2}-\d{2}$/ },
    distance: { type: Number, required: true, min: 0 },
    durationSeconds: { type: Number, required: true, min: 1 },
    type: {
      type: String,
      required: true,
      enum: ["easy", "tempo", "intervals", "long", "race", "other"],
      default: "easy",
    },
    notes: { type: String, trim: true },
  },
  { timestamps: true }
);

RunLogSchema.index({ date: -1, createdAt: -1 });

if (process.env.NODE_ENV !== "production" && mongoose.models.RunLog) {
  delete mongoose.models.RunLog;
}

const RunLog: Model<IRunLog> =
  mongoose.models.RunLog || mongoose.model<IRunLog>("RunLog", RunLogSchema);

export default RunLog;
