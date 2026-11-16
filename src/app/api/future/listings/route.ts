import { NextRequest, NextResponse } from "next/server";
import { connectDB } from "@/lib/db";
import Listing from "@/models/future/Listing";
import { LISTING_STATUSES, listingSchema } from "@/lib/future/validators";
import { escapeRegex, serverError, validationError } from "@/lib/api-helpers";

export async function GET(request: NextRequest) {
  try {
    await connectDB();
    const { searchParams } = new URL(request.url);
    const filter: Record<string, unknown> = {};
    const city = searchParams.get("city")?.trim();
    if (city) filter.city = new RegExp(`^${escapeRegex(city)}$`, "i");
    const status = searchParams.get("status");
    if (status && (LISTING_STATUSES as readonly string[]).includes(status)) filter.status = status;

    const listings = await Listing.find(filter).sort({ rent: 1, createdAt: -1 }).limit(1000).lean();
    return NextResponse.json(listings, { status: 200 });
  } catch (error) {
    return serverError("GET /api/future/listings", error, "Failed to fetch listings");
  }
}

export async function POST(request: Request) {
  try {
    await connectDB();
    const parsed = listingSchema.safeParse(await request.json());
    if (!parsed.success) return validationError(parsed.error);
    const listing = await Listing.create(parsed.data);
    return NextResponse.json(listing, { status: 201 });
  } catch (error) {
    return serverError("POST /api/future/listings", error, "Failed to create listing");
  }
}
