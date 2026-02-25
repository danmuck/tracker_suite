import mongoose, { Schema, Document, Model } from "mongoose";

export interface IAccount extends Document {
  name: string;
  type: "bank" | "credit_card" | "debt";
  balance: number;
  creditLimit?: number;
  isLoan?: boolean;
  linkedAccountId?: mongoose.Types.ObjectId;
  currency: string;
  notes?: string;
  isCash?: boolean;
  createdAt: Date;
  updatedAt: Date;
}

const AccountSchema = new Schema<IAccount>(
  {
    name: { type: String, required: true, trim: true },
    type: { type: String, required: true, enum: ["bank", "credit_card", "debt"] },
    balance: { type: Number, default: 0 },
    creditLimit: { type: Number },
    isLoan: { type: Boolean },
    linkedAccountId: { type: Schema.Types.ObjectId, ref: "Account" },
    currency: { type: String, default: "USD" },
    notes: { type: String, trim: true },
    isCash: { type: Boolean, default: false },
  },
  { timestamps: true }
);

const Account: Model<IAccount> =
  mongoose.models.Account || mongoose.model<IAccount>("Account", AccountSchema);

export default Account;
