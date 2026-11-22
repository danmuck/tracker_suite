import mongoose, { Schema, Document, Model, Types } from "mongoose";

export interface ILink extends Document {
  groupId: Types.ObjectId;
  name: string;
  url: string;
  order: number;
  createdAt: Date;
  updatedAt: Date;
}

const LinkSchema = new Schema<ILink>(
  {
    groupId: { type: Schema.Types.ObjectId, ref: "LinkGroup", required: true, index: true },
    name: { type: String, required: true, trim: true },
    url: { type: String, required: true, trim: true },
    order: { type: Number, default: 0 },
  },
  { timestamps: true }
);

if (process.env.NODE_ENV !== "production" && mongoose.models.Link) {
  delete mongoose.models.Link;
}

const Link: Model<ILink> =
  mongoose.models.Link || mongoose.model<ILink>("Link", LinkSchema);

export default Link;
