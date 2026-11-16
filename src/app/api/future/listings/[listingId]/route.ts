import { NextResponse } from "next/server";
import { connectDB } from "@/lib/db";
import Listing from "@/models/future/Listing";
import Tour from "@/models/future/Tour";
import { LISTING_OPTIONAL_FIELDS, listingSchema, listingStatusSchema } from "@/lib/future/validators";
import { isValidObjectId, notFound, serverError, setAndUnset, validationError } from "@/lib/api-helpers";

type Ctx = { params: Promise<{ listingId: string }> };

/** Full replace: optional fields left out of the body are cleared */
export async function PUT(request: Request, { params }: Ctx) {
  try {
    await connectDB();
    const { listingId } = await params;
    if (!isValidObjectId(listingId)) return notFound("Listing");
    const parsed = listingSchema.safeParse(await request.json());
    if (!parsed.success) return validationError(parsed.error);

    const updated = await Listing.findByIdAndUpdate(
      listingId,
      setAndUnset(parsed.data, LISTING_OPTIONAL_FIELDS),
      { new: true, runValidators: true }
    );
    if (!updated) return notFound("Listing");
    return NextResponse.json(updated, { status: 200 });
  } catch (error) {
    return serverError("PUT /api/future/listings/[listingId]", error, "Failed to update listing");
  }
}

/** Status-only change; leaves every other field alone */
export async function PATCH(request: Request, { params }: Ctx) {
  try {
    await connectDB();
    const { listingId } = await params;
    if (!isValidObjectId(listingId)) return notFound("Listing");
    const parsed = listingStatusSchema.safeParse(await request.json());
    if (!parsed.success) return validationError(parsed.error);

    const updated = await Listing.findByIdAndUpdate(
      listingId,
      { $set: { status: parsed.data.status } },
      { new: true, runValidators: true }
    );
    if (!updated) return notFound("Listing");
    return NextResponse.json(updated, { status: 200 });
  } catch (error) {
    return serverError("PATCH /api/future/listings/[listingId]", error, "Failed to update status");
  }
}

/** Deletes the listing and every tour scheduled for it */
export async function DELETE(_request: Request, { params }: Ctx) {
  try {
    await connectDB();
    const { listingId } = await params;
    if (!isValidObjectId(listingId)) return notFound("Listing");
    const deleted = await Listing.findByIdAndDelete(listingId);
    if (!deleted) return notFound("Listing");
    await Tour.deleteMany({ listingId });
    return NextResponse.json({ message: "Listing deleted" }, { status: 200 });
  } catch (error) {
    return serverError("DELETE /api/future/listings/[listingId]", error, "Failed to delete listing");
  }
}
