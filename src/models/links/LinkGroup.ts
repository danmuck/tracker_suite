import mongoose, { Schema, Document, Model } from "mongoose";

export interface ILinkGroup extends Document {
  name: string;
  slug: string;
  icon?: string;
  order: number;
  createdAt: Date;
  updatedAt: Date;
}

const LinkGroupSchema = new Schema<ILinkGroup>(
  {
    name: { type: String, required: true, trim: true },
    slug: { type: String, required: true, unique: true, trim: true },
    icon: { type: String, trim: true },
    order: { type: Number, default: 0 },
  },
  { timestamps: true }
);

if (process.env.NODE_ENV !== "production" && mongoose.models.LinkGroup) {
  delete mongoose.models.LinkGroup;
}

const LinkGroup: Model<ILinkGroup> =
  mongoose.models.LinkGroup ||
  mongoose.model<ILinkGroup>("LinkGroup", LinkGroupSchema);

export default LinkGroup;
