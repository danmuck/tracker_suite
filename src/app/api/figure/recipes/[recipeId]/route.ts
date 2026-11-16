import { NextResponse } from "next/server";
import { connectDB } from "@/lib/db";
import Recipe from "@/models/figure/Recipe";
import { recipeSchema } from "@/lib/figure/validators";
import { isValidObjectId, notFound, serverError, validationError } from "@/lib/api-helpers";

type Ctx = { params: Promise<{ recipeId: string }> };

// GET /api/figure/recipes/:recipeId
export async function GET(_request: Request, { params }: Ctx) {
  try {
    await connectDB();
    const { recipeId } = await params;
    if (!isValidObjectId(recipeId)) return notFound("Recipe");
    const recipe = await Recipe.findById(recipeId).lean();
    if (!recipe) return notFound("Recipe");
    return NextResponse.json(recipe, { status: 200 });
  } catch (error) {
    return serverError("GET /api/figure/recipes/[recipeId]", error, "Failed to fetch recipe");
  }
}

// PUT /api/figure/recipes/:recipeId
export async function PUT(request: Request, { params }: Ctx) {
  try {
    await connectDB();
    const { recipeId } = await params;
    if (!isValidObjectId(recipeId)) return notFound("Recipe");
    const parsed = recipeSchema.safeParse(await request.json());
    if (!parsed.success) return validationError(parsed.error);

    const { servings, ...rest } = parsed.data;
    const update =
      servings === undefined ? { $set: rest, $unset: { servings: 1 } } : { $set: { ...rest, servings } };
    const updated = await Recipe.findByIdAndUpdate(recipeId, update, { new: true, runValidators: true });
    if (!updated) return notFound("Recipe");
    return NextResponse.json(updated, { status: 200 });
  } catch (error) {
    return serverError("PUT /api/figure/recipes/[recipeId]", error, "Failed to update recipe");
  }
}

// DELETE /api/figure/recipes/:recipeId — shopping items added from it stay on the list
export async function DELETE(_request: Request, { params }: Ctx) {
  try {
    await connectDB();
    const { recipeId } = await params;
    if (!isValidObjectId(recipeId)) return notFound("Recipe");
    const deleted = await Recipe.findByIdAndDelete(recipeId);
    if (!deleted) return notFound("Recipe");
    return NextResponse.json({ message: "Recipe deleted" }, { status: 200 });
  } catch (error) {
    return serverError("DELETE /api/figure/recipes/[recipeId]", error, "Failed to delete recipe");
  }
}
