import { NextRequest, NextResponse } from "next/server";
import { connectDB } from "@/lib/db";
import LinkModel from "@/models/links/Link";
import { linkSchema } from "@/lib/links/validators";

// GET /api/links/:linkId
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ linkId: string }> }
) {
  try {
    await connectDB();
    const { linkId } = await params;

    const link = await LinkModel.findById(linkId);
    if (!link) {
      return NextResponse.json({ error: "Link not found" }, { status: 404 });
    }

    return NextResponse.json(link, { status: 200 });
  } catch (error) {
    console.error("GET /api/links/[linkId] error:", error);
    return NextResponse.json(
      { error: "Failed to fetch link" },
      { status: 500 }
    );
  }
}

// PUT /api/links/:linkId
export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ linkId: string }> }
) {
  try {
    await connectDB();
    const { linkId } = await params;

    const existing = await LinkModel.findById(linkId);
    if (!existing) {
      return NextResponse.json({ error: "Link not found" }, { status: 404 });
    }

    const body = await request.json();
    const parsed = linkSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { error: "Validation failed", details: parsed.error.flatten() },
        { status: 400 }
      );
    }

    const updated = await LinkModel.findByIdAndUpdate(
      linkId,
      { name: parsed.data.name, url: parsed.data.url },
      { new: true, runValidators: true }
    );

    return NextResponse.json(updated, { status: 200 });
  } catch (error) {
    console.error("PUT /api/links/[linkId] error:", error);
    return NextResponse.json(
      { error: "Failed to update link" },
      { status: 500 }
    );
  }
}

// DELETE /api/links/:linkId
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ linkId: string }> }
) {
  try {
    await connectDB();
    const { linkId } = await params;

    const link = await LinkModel.findById(linkId);
    if (!link) {
      return NextResponse.json({ error: "Link not found" }, { status: 404 });
    }

    await LinkModel.findByIdAndDelete(linkId);

    return NextResponse.json(
      { message: "Link deleted" },
      { status: 200 }
    );
  } catch (error) {
    console.error("DELETE /api/links/[linkId] error:", error);
    return NextResponse.json(
      { error: "Failed to delete link" },
      { status: 500 }
    );
  }
}
