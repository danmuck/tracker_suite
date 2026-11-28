import mongoose, { Schema, Document, Model, Types } from "mongoose";

export interface ILink extends Document {
  ownerId?: string;
  groupId: Types.ObjectId;
  name: string;
  url: string;
  order: number;
  createdAt: Date;
  updatedAt: Date;
}

const LinkSchema = new Schema<ILink>(
  {
    ownerId: { type: String },
    groupId: { type: Schema.Types.ObjectId, ref: "LinkGroup", required: true },
    name: { type: String, required: true, trim: true },
    url: { type: String, required: true, trim: true },
    order: { type: Number, default: 0 },
  },
  { timestamps: true }
);

LinkSchema.index({ ownerId: 1, groupId: 1 });

if (process.env.NODE_ENV !== "production" && mongoose.models.Link) {
  delete mongoose.models.Link;
}

const Link: Model<ILink> =
  mongoose.models.Link || mongoose.model<ILink>("Link", LinkSchema);

export default Link;
