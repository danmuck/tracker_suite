import { NextRequest, NextResponse } from "next/server";
import { connectDB } from "@/lib/db";
import LinkGroup from "@/models/links/LinkGroup";
import LinkModel from "@/models/links/Link";
import { linkGroupSchema } from "@/lib/links/validators";

function slugify(text: string): string {
  return text
    .toLowerCase()
    .trim()
    .replace(/[^\w\s-]/g, "")
    .replace(/[\s_]+/g, "-")
    .replace(/-+/g, "-");
}

// GET /api/link-groups — list all groups with link counts
export async function GET() {
  try {
    await connectDB();

    const groups = await LinkGroup.find().sort({ order: 1, createdAt: -1 }).lean();

    const groupIds = groups.map((g) => g._id);
    const counts = await LinkModel.aggregate([
      { $match: { groupId: { $in: groupIds } } },
      { $group: { _id: "$groupId", count: { $sum: 1 } } },
    ]);

    const countsMap = new Map(
      counts.map((c) => [c._id.toString(), c.count as number])
    );

    const result = groups.map((g) => ({
      ...g,
      linkCount: countsMap.get(g._id.toString()) || 0,
    }));

    return NextResponse.json(result, { status: 200 });
  } catch (error) {
    console.error("GET /api/link-groups error:", error);
    return NextResponse.json(
      { error: "Failed to fetch link groups" },
      { status: 500 }
    );
  }
}

// POST /api/link-groups — create a new group
export async function POST(request: NextRequest) {
  try {
    await connectDB();

    const body = await request.json();
    const parsed = linkGroupSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { error: "Validation failed", details: parsed.error.flatten() },
        { status: 400 }
      );
    }

    const { name, icon } = parsed.data;
    let slug = slugify(name);

    // Ensure unique slug
    const existing = await LinkGroup.findOne({ slug });
    if (existing) {
      slug = `${slug}-${Date.now()}`;
    }

    const maxOrder = await LinkGroup.findOne().sort({ order: -1 }).select("order").lean();
    const order = (maxOrder?.order ?? -1) + 1;

    const group = await LinkGroup.create({ name, slug, icon, order });

    return NextResponse.json(group, { status: 201 });
  } catch (error) {
    console.error("POST /api/link-groups error:", error);
    return NextResponse.json(
      { error: "Failed to create link group" },
      { status: 500 }
    );
  }
}
