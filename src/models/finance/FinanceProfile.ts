import mongoose, { Schema, Document, Model } from "mongoose";
import { FILING_STATUSES } from "@/lib/finance/constants";

// Singleton document backing the Finance → Datasheet page. Money in cents.
export interface IFinanceProfile extends Document {
  filingStatus: (typeof FILING_STATUSES)[number];
  hoursPerWeek: number;
  nycResident: boolean;
  raiseRate: number;
  salaryTransactionId?: mongoose.Types.ObjectId | null;
  rentTransactionId?: mongoose.Types.ObjectId | null;
  salarySteps: { effectiveDate: Date; annualGross: number }[];
  retirementSteps: { effectiveDate: Date; percent: number }[];
  healthSteps: { effectiveDate: Date; perPaycheck: number }[];
  rentSteps: { effectiveDate: Date; monthly: number }[];
  whatIfSalaries: { label?: string; annualGross: number }[];
  createdAt: Date;
  updatedAt: Date;
}

function stepSchema(field: string) {
  return new Schema(
    {
      effectiveDate: { type: Date, required: true },
      [field]: { type: Number, required: true },
    },
    { _id: false }
  );
}

const FinanceProfileSchema = new Schema<IFinanceProfile>(
  {
    filingStatus: { type: String, enum: FILING_STATUSES, default: "single" },
    hoursPerWeek: { type: Number, default: 40 },
    nycResident: { type: Boolean, default: false },
    raiseRate: { type: Number, default: 0.03 },
    salaryTransactionId: { type: Schema.Types.ObjectId, ref: "Transaction", default: null },
    rentTransactionId: { type: Schema.Types.ObjectId, ref: "Transaction", default: null },
    salarySteps: { type: [stepSchema("annualGross")], default: [] },
    retirementSteps: { type: [stepSchema("percent")], default: [] },
    healthSteps: { type: [stepSchema("perPaycheck")], default: [] },
    rentSteps: { type: [stepSchema("monthly")], default: [] },
    whatIfSalaries: {
      type: [new Schema({ label: { type: String, trim: true }, annualGross: { type: Number, required: true } }, { _id: false })],
      default: [],
    },
  },
  { timestamps: true }
);

// Delete cached model in development to pick up schema changes on hot reload
if (process.env.NODE_ENV !== "production" && mongoose.models.FinanceProfile) {
  delete mongoose.models.FinanceProfile;
}

const FinanceProfile: Model<IFinanceProfile> =
  mongoose.models.FinanceProfile || mongoose.model<IFinanceProfile>("FinanceProfile", FinanceProfileSchema);

export default FinanceProfile;
