import { NextResponse } from "next/server";
import { connectDB } from "@/lib/db";
import Listing from "@/models/future/Listing";
import Tour from "@/models/future/Tour";
import { tourSchema } from "@/lib/future/validators";
import { isValidObjectId, serverError, validationError } from "@/lib/api-helpers";

export async function GET() {
  try {
    await connectDB();
    const tours = await Tour.find().sort({ date: 1, time: 1 }).limit(1000).lean();
    return NextResponse.json(tours, { status: 200 });
  } catch (error) {
    return serverError("GET /api/future/tours", error, "Failed to fetch tours");
  }
}

export async function POST(request: Request) {
  try {
    await connectDB();
    const parsed = tourSchema.safeParse(await request.json());
    if (!parsed.success) return validationError(parsed.error);
    const { listingId } = parsed.data;
    if (!isValidObjectId(listingId) || !(await Listing.exists({ _id: listingId }))) {
      return NextResponse.json({ error: "That listing no longer exists" }, { status: 400 });
    }
    const tour = await Tour.create(parsed.data);
    return NextResponse.json(tour, { status: 201 });
  } catch (error) {
    return serverError("POST /api/future/tours", error, "Failed to schedule tour");
  }
}
