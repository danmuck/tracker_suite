import { NextResponse } from "next/server";
import { connectDB } from "@/lib/db";
import ShoppingItem from "@/models/figure/ShoppingItem";
import { shoppingItemUpdateSchema } from "@/lib/figure/validators";
import { isValidObjectId, notFound, serverError, validationError } from "@/lib/api-helpers";

type Ctx = { params: Promise<{ itemId: string }> };

// PUT /api/figure/shopping-items/:itemId — partial update (e.g. { checked: true })
export async function PUT(request: Request, { params }: Ctx) {
  try {
    await connectDB();
    const { itemId } = await params;
    if (!isValidObjectId(itemId)) return notFound("Shopping item");
    const parsed = shoppingItemUpdateSchema.safeParse(await request.json());
    if (!parsed.success) return validationError(parsed.error);

    const updated = await ShoppingItem.findByIdAndUpdate(itemId, parsed.data, {
      new: true,
      runValidators: true,
    });
    if (!updated) return notFound("Shopping item");
    return NextResponse.json(updated, { status: 200 });
  } catch (error) {
    return serverError("PUT /api/figure/shopping-items/[itemId]", error, "Failed to update shopping item");
  }
}

// DELETE /api/figure/shopping-items/:itemId
export async function DELETE(_request: Request, { params }: Ctx) {
  try {
    await connectDB();
    const { itemId } = await params;
    if (!isValidObjectId(itemId)) return notFound("Shopping item");
    const deleted = await ShoppingItem.findByIdAndDelete(itemId);
    if (!deleted) return notFound("Shopping item");
    return NextResponse.json({ message: "Shopping item deleted" }, { status: 200 });
  } catch (error) {
    return serverError("DELETE /api/figure/shopping-items/[itemId]", error, "Failed to delete shopping item");
  }
}
