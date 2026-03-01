import { NextRequest, NextResponse } from "next/server";
import { connectDB } from "@/lib/db";
import Project from "@/models/projects/Project";
import Scratchpad from "@/models/projects/Scratchpad";
import { scratchpadSchema } from "@/lib/projects/validators";

// GET /api/projects/:projectId/scratchpad
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ projectId: string }> }
) {
  try {
    await connectDB();
    const { projectId } = await params;

    const project = await Project.findById(projectId);
    if (!project) {
      return NextResponse.json({ error: "Project not found" }, { status: 404 });
    }

    let scratchpad = await Scratchpad.findOne({ projectId });
    if (!scratchpad) {
      scratchpad = await Scratchpad.create({ projectId, content: "" });
    }

    return NextResponse.json(scratchpad, { status: 200 });
  } catch (error) {
    console.error("GET /api/projects/[projectId]/scratchpad error:", error);
    return NextResponse.json(
      { error: "Failed to fetch scratchpad" },
      { status: 500 }
    );
  }
}

// PUT /api/projects/:projectId/scratchpad — upsert
export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ projectId: string }> }
) {
  try {
    await connectDB();
    const { projectId } = await params;

    const project = await Project.findById(projectId);
    if (!project) {
      return NextResponse.json({ error: "Project not found" }, { status: 404 });
    }

    const body = await request.json();
    const parsed = scratchpadSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { error: "Validation failed", details: parsed.error.flatten() },
        { status: 400 }
      );
    }

    const scratchpad = await Scratchpad.findOneAndUpdate(
      { projectId },
      { content: parsed.data.content },
      { new: true, upsert: true }
    );

    return NextResponse.json(scratchpad, { status: 200 });
  } catch (error) {
    console.error("PUT /api/projects/[projectId]/scratchpad error:", error);
    return NextResponse.json(
      { error: "Failed to update scratchpad" },
      { status: 500 }
    );
  }
}
