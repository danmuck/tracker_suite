import { NextResponse } from "next/server";
import { connectDB } from "@/lib/db";
import ShoppingItem from "@/models/figure/ShoppingItem";
import { serverError } from "@/lib/figure/api";

// POST /api/figure/shopping-items/clear-checked — remove every checked item
export async function POST() {
  try {
    await connectDB();
    const { deletedCount } = await ShoppingItem.deleteMany({ checked: true });
    return NextResponse.json({ deleted: deletedCount }, { status: 200 });
  } catch (error) {
    return serverError("POST /api/figure/shopping-items/clear-checked", error, "Failed to clear checked items");
  }
}
