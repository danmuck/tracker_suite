import mongoose, { Schema, Document, Model } from "mongoose";

export interface IAuthUser extends Document {
  email: string;
  name: string;
  passwordHash: string;
  role: "admin" | "member";
  disabledAt?: Date;
  passwordChangedAt?: Date;
  recoveryCodes: { hash: string; usedAt?: Date }[];
  appleSub?: string;
  /** Reserved for a later second sign-in step. */
  secondStep?: unknown;
  createdAt: Date;
  updatedAt: Date;
}

const AuthUserSchema = new Schema<IAuthUser>(
  {
    email: { type: String, required: true, lowercase: true, trim: true, unique: true },
    name: { type: String, required: true, trim: true },
    // Secrets are never read by accident: a query that needs them asks with select("+passwordHash").
    passwordHash: { type: String, required: true, select: false },
    role: { type: String, enum: ["admin", "member"], default: "member" },
    disabledAt: { type: Date },
    passwordChangedAt: { type: Date },
    recoveryCodes: {
      type: [
        new Schema(
          {
            hash: { type: String, required: true },
            usedAt: { type: Date },
          },
          { _id: false }
        ),
      ],
      select: false,
    },
    appleSub: { type: String, unique: true, sparse: true },
    secondStep: { type: Schema.Types.Mixed, default: undefined },
  },
  { timestamps: true }
);

// Delete cached model in development to pick up schema changes on hot reload
if (process.env.NODE_ENV !== "production" && mongoose.models.AuthUser) {
  delete mongoose.models.AuthUser;
}

const AuthUser: Model<IAuthUser> =
  mongoose.models.AuthUser || mongoose.model<IAuthUser>("AuthUser", AuthUserSchema);

export default AuthUser;
