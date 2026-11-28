import mongoose, { Schema, Document, Model } from "mongoose";

export interface ICategory extends Document {
  ownerId?: string;
  name: string;
  color: string;
  icon: string;
  isDefault: boolean;
  createdAt: Date;
  updatedAt: Date;
}

const CategorySchema = new Schema<ICategory>(
  {
    ownerId: { type: String },
    name: { type: String, required: true, trim: true, lowercase: true },
    color: { type: String, required: true },
    icon: { type: String, required: true },
    isDefault: { type: Boolean, default: false },
  },
  { timestamps: true }
);

CategorySchema.index({ ownerId: 1, name: 1 }, { unique: true });

const Category: Model<ICategory> =
  mongoose.models.Category || mongoose.model<ICategory>("Category", CategorySchema);

export default Category;
