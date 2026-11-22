import mongoose, { Schema, Document, Model } from "mongoose";

export interface IRecipe extends Document {
  name: string;
  servings?: number;
  ingredients: { name: string; quantity?: number; unit?: string }[];
  instructions: string;
  tags: string[];
  createdAt: Date;
  updatedAt: Date;
}

const IngredientSchema = new Schema(
  {
    name: { type: String, required: true, trim: true },
    quantity: { type: Number, min: 0 },
    unit: { type: String, trim: true },
  },
  { _id: false }
);

const RecipeSchema = new Schema<IRecipe>(
  {
    name: { type: String, required: true, trim: true },
    servings: { type: Number, min: 1 },
    ingredients: { type: [IngredientSchema], default: [] },
    instructions: { type: String, default: "" },
    tags: [{ type: String, trim: true }],
  },
  { timestamps: true }
);

if (process.env.NODE_ENV !== "production" && mongoose.models.Recipe) {
  delete mongoose.models.Recipe;
}

const Recipe: Model<IRecipe> =
  mongoose.models.Recipe || mongoose.model<IRecipe>("Recipe", RecipeSchema);

export default Recipe;
