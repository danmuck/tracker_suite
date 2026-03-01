import { NextRequest, NextResponse } from "next/server";
import { connectDB } from "@/lib/db";
import LinkModel from "@/models/links/Link";
import LinkGroup from "@/models/links/LinkGroup";
import { linkSchema } from "@/lib/links/validators";

// GET /api/links — filter by ?groupId=
export async function GET(request: NextRequest) {
  try {
    await connectDB();

    const { searchParams } = request.nextUrl;
    const groupId = searchParams.get("groupId");

    const filter: Record<string, string> = {};
    if (groupId) {
      filter.groupId = groupId;
    }

    const links = await LinkModel.find(filter).sort({ order: 1, createdAt: -1 }).lean();

    return NextResponse.json(links, { status: 200 });
  } catch (error) {
    console.error("GET /api/links error:", error);
    return NextResponse.json(
      { error: "Failed to fetch links" },
      { status: 500 }
    );
  }
}

// POST /api/links — create a new link
export async function POST(request: NextRequest) {
  try {
    await connectDB();

    const body = await request.json();
    const parsed = linkSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { error: "Validation failed", details: parsed.error.flatten() },
        { status: 400 }
      );
    }

    const { groupId, name, url } = parsed.data;

    // Verify group exists
    const group = await LinkGroup.findById(groupId);
    if (!group) {
      return NextResponse.json(
        { error: "Link group not found" },
        { status: 404 }
      );
    }

    const maxOrder = await LinkModel.findOne({ groupId }).sort({ order: -1 }).select("order").lean();
    const order = (maxOrder?.order ?? -1) + 1;

    const link = await LinkModel.create({ groupId, name, url, order });

    return NextResponse.json(link, { status: 201 });
  } catch (error) {
    console.error("POST /api/links error:", error);
    return NextResponse.json(
      { error: "Failed to create link" },
      { status: 500 }
    );
  }
}
