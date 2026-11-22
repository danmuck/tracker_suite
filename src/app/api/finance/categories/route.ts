import { NextRequest, NextResponse } from "next/server";
import { connectDB } from "@/lib/db";
import Category from "@/models/Category";
import { categorySchema } from "@/lib/validators";
import { DEFAULT_CATEGORIES } from "@/lib/constants";

async function seedDefaults() {
  const count = await Category.countDocuments();
  if (count === 0) {
    await Category.insertMany(DEFAULT_CATEGORIES);
  }
}

export async function GET() {
  try {
    await connectDB();
    await seedDefaults();
    const categories = await Category.find().sort({ isDefault: -1, name: 1 });
    return NextResponse.json({ data: categories });
  } catch (error) {
    return NextResponse.json({ error: "Failed to fetch categories" }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    await connectDB();
    const body = await request.json();
    const validated = categorySchema.parse(body);

    const existing = await Category.findOne({ name: validated.name.toLowerCase() });
    if (existing) {
      return NextResponse.json({ error: "Category already exists" }, { status: 400 });
    }

    const category = await Category.create({ ...validated, name: validated.name.toLowerCase() });
    return NextResponse.json({ data: category }, { status: 201 });
  } catch (error) {
    if (error instanceof Error && error.name === "ZodError") {
      return NextResponse.json({ error: "Validation failed", details: error }, { status: 400 });
    }
    return NextResponse.json({ error: "Failed to create category" }, { status: 500 });
  }
}
