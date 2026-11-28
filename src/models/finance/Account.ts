import mongoose, { Schema, Document, Model } from "mongoose";

export interface IAccount extends Document {
  ownerId?: string;
  name: string;
  type: "bank" | "credit_card" | "debt";
  balance: number;
  creditLimit?: number;
  isLoan?: boolean;
  linkedAccountId?: mongoose.Types.ObjectId;
  currency: string;
  notes?: string;
  isCash?: boolean;
  isArchived?: boolean;
  /** Credit card / debt: annual rate as a fraction (0.065) */
  apr?: number;
  /** Credit card / debt: minimum monthly payment, cents */
  minimumPayment?: number;
  /** Recurring bank → this account transfer whose amountSchedule is the payment plan */
  paymentTransactionId?: mongoose.Types.ObjectId;
  /** Debt: sub-loans under one total balance; their blended rate drives interest */
  subLoans?: { name: string; balance: number; apr: number }[];
  /** Debt: federal Repayment Assistance Plan settings */
  rap?: { enabled: boolean; autoSchedule: boolean; recertDate: string; dependents: number };
  createdAt: Date;
  updatedAt: Date;
}

const AccountSchema = new Schema<IAccount>(
  {
    ownerId: { type: String },
    name: { type: String, required: true, trim: true },
    type: { type: String, required: true, enum: ["bank", "credit_card", "debt"] },
    balance: { type: Number, default: 0 },
    creditLimit: { type: Number },
    isLoan: { type: Boolean },
    linkedAccountId: { type: Schema.Types.ObjectId, ref: "Account" },
    currency: { type: String, default: "USD" },
    notes: { type: String, trim: true },
    isCash: { type: Boolean, default: false },
    isArchived: { type: Boolean, default: false },
    apr: { type: Number, min: 0, max: 1 },
    minimumPayment: { type: Number, min: 0 },
    paymentTransactionId: { type: Schema.Types.ObjectId, ref: "Transaction" },
    subLoans: {
      type: [
        new Schema(
          {
            name: { type: String, required: true, trim: true },
            balance: { type: Number, required: true, min: 0 },
            apr: { type: Number, required: true, min: 0, max: 1 },
          },
          { _id: false }
        ),
      ],
      default: undefined,
    },
    rap: {
      type: new Schema(
        {
          enabled: { type: Boolean, default: false },
          autoSchedule: { type: Boolean, default: true },
          recertDate: { type: String, match: /^\d{2}-\d{2}$/, default: "07-01" },
          dependents: { type: Number, min: 0, default: 0 },
        },
        { _id: false }
      ),
      default: undefined,
    },
  },
  { timestamps: true }
);

// One cash account per owner
AccountSchema.index({ ownerId: 1 }, { unique: true, partialFilterExpression: { isCash: true } });
AccountSchema.index({ ownerId: 1, type: 1 });

// Delete cached model in development to pick up schema changes on hot reload
if (process.env.NODE_ENV !== "production" && mongoose.models.Account) {
  delete mongoose.models.Account;
}

const Account: Model<IAccount> =
  mongoose.models.Account || mongoose.model<IAccount>("Account", AccountSchema);

export default Account;
