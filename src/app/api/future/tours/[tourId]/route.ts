import { NextResponse } from "next/server";
import { connectDB } from "@/lib/db";
import Listing from "@/models/future/Listing";
import Tour from "@/models/future/Tour";
import { tourSchema } from "@/lib/future/validators";
import { isValidObjectId, notFound, serverError, setAndUnset, validationError } from "@/lib/api-helpers";

type Ctx = { params: Promise<{ tourId: string }> };

export async function PUT(request: Request, { params }: Ctx) {
  try {
    await connectDB();
    const { tourId } = await params;
    if (!isValidObjectId(tourId)) return notFound("Tour");
    const parsed = tourSchema.safeParse(await request.json());
    if (!parsed.success) return validationError(parsed.error);
    const { listingId } = parsed.data;
    if (!isValidObjectId(listingId) || !(await Listing.exists({ _id: listingId }))) {
      return NextResponse.json({ error: "That listing no longer exists" }, { status: 400 });
    }

    const updated = await Tour.findByIdAndUpdate(tourId, setAndUnset(parsed.data, ["time", "notes"]), {
      new: true,
      runValidators: true,
    });
    if (!updated) return notFound("Tour");
    return NextResponse.json(updated, { status: 200 });
  } catch (error) {
    return serverError("PUT /api/future/tours/[tourId]", error, "Failed to update tour");
  }
}

export async function DELETE(_request: Request, { params }: Ctx) {
  try {
    await connectDB();
    const { tourId } = await params;
    if (!isValidObjectId(tourId)) return notFound("Tour");
    const deleted = await Tour.findByIdAndDelete(tourId);
    if (!deleted) return notFound("Tour");
    return NextResponse.json({ message: "Tour deleted" }, { status: 200 });
  } catch (error) {
    return serverError("DELETE /api/future/tours/[tourId]", error, "Failed to delete tour");
  }
}
