import mongoose, { Schema, Document, Model } from "mongoose";

export interface IShoppingItem extends Document {
  ownerId?: string;
  name: string;
  quantity?: number;
  unit?: string;
  checked: boolean;
  recipeId?: mongoose.Types.ObjectId;
  order: number;
  createdAt: Date;
  updatedAt: Date;
}

const ShoppingItemSchema = new Schema<IShoppingItem>(
  {
    ownerId: { type: String },
    name: { type: String, required: true, trim: true },
    quantity: { type: Number, min: 0 },
    unit: { type: String, trim: true },
    checked: { type: Boolean, default: false },
    recipeId: { type: Schema.Types.ObjectId, ref: "Recipe" },
    order: { type: Number, default: 0 },
  },
  { timestamps: true }
);

ShoppingItemSchema.index({ ownerId: 1, checked: 1, order: 1 });

if (process.env.NODE_ENV !== "production" && mongoose.models.ShoppingItem) {
  delete mongoose.models.ShoppingItem;
}

const ShoppingItem: Model<IShoppingItem> =
  mongoose.models.ShoppingItem ||
  mongoose.model<IShoppingItem>("ShoppingItem", ShoppingItemSchema);

export default ShoppingItem;
