import { NextResponse } from "next/server";
import { connectDB } from "@/lib/db";
import ShoppingItem from "@/models/figure/ShoppingItem";
import Recipe from "@/models/figure/Recipe";
import { shoppingItemSchema } from "@/lib/figure/validators";
import { serverError, validationError } from "@/lib/api-helpers";

// GET /api/figure/shopping-items — unchecked first, each with its source recipe's name
export async function GET() {
  try {
    await connectDB();
    const items = await ShoppingItem.find().sort({ checked: 1, order: 1 }).lean();
    const recipeIds = [...new Set(items.filter((i) => i.recipeId).map((i) => String(i.recipeId)))];
    const recipes = recipeIds.length
      ? await Recipe.find({ _id: { $in: recipeIds } }).select("name").lean()
      : [];
    const names = new Map(recipes.map((r) => [String(r._id), r.name]));
    const result = items.map((i) => ({
      ...i,
      recipeName: i.recipeId ? names.get(String(i.recipeId)) : undefined,
    }));
    return NextResponse.json(result, { status: 200 });
  } catch (error) {
    return serverError("GET /api/figure/shopping-items", error, "Failed to fetch shopping list");
  }
}

// POST /api/figure/shopping-items — add a freeform item
export async function POST(request: Request) {
  try {
    await connectDB();
    const parsed = shoppingItemSchema.safeParse(await request.json());
    if (!parsed.success) return validationError(parsed.error);
    const last = await ShoppingItem.findOne().sort({ order: -1 }).select("order").lean();
    const item = await ShoppingItem.create({ ...parsed.data, order: (last?.order ?? -1) + 1 });
    return NextResponse.json(item, { status: 201 });
  } catch (error) {
    return serverError("POST /api/figure/shopping-items", error, "Failed to add shopping item");
  }
}
