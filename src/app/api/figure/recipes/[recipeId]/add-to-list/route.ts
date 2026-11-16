import { NextResponse } from "next/server";
import { connectDB } from "@/lib/db";
import Recipe from "@/models/figure/Recipe";
import ShoppingItem from "@/models/figure/ShoppingItem";
import { escapeRegex, isValidObjectId, notFound, serverError } from "@/lib/api-helpers";

type Ctx = { params: Promise<{ recipeId: string }> };

/**
 * POST /api/figure/recipes/:recipeId/add-to-list
 * Adds each ingredient to the shopping list. An unchecked item with the same
 * name and unit (case-insensitive) is merged by summing quantities instead of duplicated.
 */
export async function POST(_request: Request, { params }: Ctx) {
  try {
    await connectDB();
    const { recipeId } = await params;
    if (!isValidObjectId(recipeId)) return notFound("Recipe");
    const recipe = await Recipe.findById(recipeId).lean();
    if (!recipe) return notFound("Recipe");

    const last = await ShoppingItem.findOne().sort({ order: -1 }).select("order").lean();
    let nextOrder = (last?.order ?? -1) + 1;
    let added = 0;
    let merged = 0;

    for (const ing of recipe.ingredients) {
      const unit = ing.unit?.trim() || undefined;
      const existing = await ShoppingItem.findOne({
        checked: false,
        name: new RegExp(`^${escapeRegex(ing.name.trim())}$`, "i"),
        ...(unit
          ? { unit: new RegExp(`^${escapeRegex(unit)}$`, "i") }
          : { $or: [{ unit: { $exists: false } }, { unit: "" }, { unit: null }] }),
      });

      if (existing) {
        if (ing.quantity !== undefined && ing.quantity !== null) {
          existing.quantity = (existing.quantity ?? 0) + ing.quantity;
          await existing.save();
        }
        merged++;
      } else {
        await ShoppingItem.create({
          name: ing.name,
          quantity: ing.quantity,
          unit,
          recipeId: recipe._id,
          order: nextOrder++,
        });
        added++;
      }
    }

    return NextResponse.json({ added, merged }, { status: 200 });
  } catch (error) {
    return serverError("POST /api/figure/recipes/[recipeId]/add-to-list", error, "Failed to add recipe to shopping list");
  }
}
