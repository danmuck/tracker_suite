import { NextRequest, NextResponse } from "next/server";
import { connectDB } from "@/lib/db";
import Recipe from "@/models/figure/Recipe";
import { recipeSchema } from "@/lib/figure/validators";
import { serverError, validationError } from "@/lib/figure/api";

// GET /api/figure/recipes — optional ?tag= filter
export async function GET(request: NextRequest) {
  try {
    await connectDB();
    const tag = request.nextUrl.searchParams.get("tag");
    const filter = tag ? { tags: tag } : {};
    const recipes = await Recipe.find(filter).sort({ name: 1 }).lean();
    return NextResponse.json(recipes, { status: 200 });
  } catch (error) {
    return serverError("GET /api/figure/recipes", error, "Failed to fetch recipes");
  }
}

// POST /api/figure/recipes
export async function POST(request: Request) {
  try {
    await connectDB();
    const parsed = recipeSchema.safeParse(await request.json());
    if (!parsed.success) return validationError(parsed.error);
    const recipe = await Recipe.create(parsed.data);
    return NextResponse.json(recipe, { status: 201 });
  } catch (error) {
    return serverError("POST /api/figure/recipes", error, "Failed to create recipe");
  }
}
