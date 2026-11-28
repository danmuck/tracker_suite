import mongoose, { Schema, Document, Model } from "mongoose";

export interface ILinkGroup extends Document {
  ownerId?: string;
  name: string;
  slug: string;
  icon?: string;
  order: number;
  createdAt: Date;
  updatedAt: Date;
}

const LinkGroupSchema = new Schema<ILinkGroup>(
  {
    ownerId: { type: String },
    name: { type: String, required: true, trim: true },
    slug: { type: String, required: true, trim: true },
    icon: { type: String, trim: true },
    order: { type: Number, default: 0 },
  },
  { timestamps: true }
);

LinkGroupSchema.index({ ownerId: 1, slug: 1 }, { unique: true });

if (process.env.NODE_ENV !== "production" && mongoose.models.LinkGroup) {
  delete mongoose.models.LinkGroup;
}

const LinkGroup: Model<ILinkGroup> =
  mongoose.models.LinkGroup ||
  mongoose.model<ILinkGroup>("LinkGroup", LinkGroupSchema);

export default LinkGroup;
