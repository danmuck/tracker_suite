import mongoose, { Schema, Document, Model } from "mongoose";

export interface IRecurrenceRule {
  frequency: "daily" | "weekly" | "biweekly" | "monthly" | "semi_monthly" | "annually" | "custom";
  interval?: number;
  startDate: Date;
  endDate?: Date | null;
  dayOfWeek?: number;
  dayOfMonth?: number;
  daysOfMonth?: number[];
}

export interface ITransaction extends Document {
  amount: number;
  date: Date;
  description: string;
  accountId: mongoose.Types.ObjectId;
  toAccountId?: mongoose.Types.ObjectId;
  type: "credit" | "debit" | "transfer";
  isRecurring: boolean;
  recurrenceRule?: IRecurrenceRule;
  categoryTags: string[];
  notes?: string;
  createdAt: Date;
  updatedAt: Date;
}

const RecurrenceRuleSchema = new Schema<IRecurrenceRule>(
  {
    frequency: {
      type: String,
      required: true,
      enum: ["daily", "weekly", "biweekly", "monthly", "semi_monthly", "annually", "custom"],
    },
    interval: { type: Number, default: 1 },
    startDate: { type: Date, required: true },
    endDate: { type: Date, default: null },
    dayOfWeek: { type: Number, min: 0, max: 6 },
    dayOfMonth: { type: Number, min: 1, max: 31 },
    daysOfMonth: [{ type: Number, min: 1, max: 31 }],
  },
  { _id: false }
);

const TransactionSchema = new Schema<ITransaction>(
  {
    amount: { type: Number, required: true },
    date: { type: Date, required: true },
    description: { type: String, required: true, trim: true },
    accountId: { type: Schema.Types.ObjectId, ref: "Account", required: true },
    toAccountId: { type: Schema.Types.ObjectId, ref: "Account" },
    type: { type: String, required: true, enum: ["credit", "debit", "transfer"] },
    isRecurring: { type: Boolean, default: false },
    recurrenceRule: { type: RecurrenceRuleSchema },
    categoryTags: [{ type: String, trim: true }],
    notes: { type: String, trim: true },
  },
  { timestamps: true }
);

TransactionSchema.index({ accountId: 1, date: -1 });
TransactionSchema.index({ toAccountId: 1, date: -1 });
TransactionSchema.index({ date: -1 });
TransactionSchema.index({ categoryTags: 1 });

// Delete cached model in development to pick up schema changes on hot reload
if (process.env.NODE_ENV !== "production" && mongoose.models.Transaction) {
  delete mongoose.models.Transaction;
}

const Transaction: Model<ITransaction> =
  mongoose.models.Transaction || mongoose.model<ITransaction>("Transaction", TransactionSchema);

export default Transaction;
