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

// GET /api/link-groups/:groupId
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ groupId: string }> }
) {
  try {
    await connectDB();
    const { groupId } = await params;

    const group = await LinkGroup.findById(groupId);
    if (!group) {
      return NextResponse.json({ error: "Group not found" }, { status: 404 });
    }

    return NextResponse.json(group, { status: 200 });
  } catch (error) {
    console.error("GET /api/link-groups/[groupId] error:", error);
    return NextResponse.json(
      { error: "Failed to fetch link group" },
      { status: 500 }
    );
  }
}

// PUT /api/link-groups/:groupId
export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ groupId: string }> }
) {
  try {
    await connectDB();
    const { groupId } = await params;

    const existing = await LinkGroup.findById(groupId);
    if (!existing) {
      return NextResponse.json({ error: "Group not found" }, { status: 404 });
    }

    const body = await request.json();
    const parsed = linkGroupSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { error: "Validation failed", details: parsed.error.flatten() },
        { status: 400 }
      );
    }

    const { name, icon } = parsed.data;

    // Regenerate slug if name changed
    let slug = existing.slug;
    if (name !== existing.name) {
      slug = slugify(name);
      const conflict = await LinkGroup.findOne({ slug, _id: { $ne: groupId } });
      if (conflict) {
        slug = `${slug}-${Date.now()}`;
      }
    }

    const updated = await LinkGroup.findByIdAndUpdate(
      groupId,
      { name, slug, icon },
      { new: true, runValidators: true }
    );

    return NextResponse.json(updated, { status: 200 });
  } catch (error) {
    console.error("PUT /api/link-groups/[groupId] error:", error);
    return NextResponse.json(
      { error: "Failed to update link group" },
      { status: 500 }
    );
  }
}

// DELETE /api/link-groups/:groupId — cascades to links
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ groupId: string }> }
) {
  try {
    await connectDB();
    const { groupId } = await params;

    const group = await LinkGroup.findById(groupId);
    if (!group) {
      return NextResponse.json({ error: "Group not found" }, { status: 404 });
    }

    await LinkModel.deleteMany({ groupId });
    await LinkGroup.findByIdAndDelete(groupId);

    return NextResponse.json(
      { message: "Group and associated links deleted" },
      { status: 200 }
    );
  } catch (error) {
    console.error("DELETE /api/link-groups/[groupId] error:", error);
    return NextResponse.json(
      { error: "Failed to delete link group" },
      { status: 500 }
    );
  }
}
