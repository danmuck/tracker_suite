import { NextRequest, NextResponse } from "next/server";
import { connectDB } from "@/lib/db";
import Project from "@/models/projects/Project";
import Task from "@/models/projects/Task";
import Scratchpad from "@/models/projects/Scratchpad";
import { projectSchema } from "@/lib/projects/validators";

// GET /api/projects/:projectId
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

    return NextResponse.json(project, { status: 200 });
  } catch (error) {
    console.error("GET /api/projects/[projectId] error:", error);
    return NextResponse.json(
      { error: "Failed to fetch project" },
      { status: 500 }
    );
  }
}

// PUT /api/projects/:projectId
export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ projectId: string }> }
) {
  try {
    await connectDB();
    const { projectId } = await params;

    const existing = await Project.findById(projectId);
    if (!existing) {
      return NextResponse.json({ error: "Project not found" }, { status: 404 });
    }

    const body = await request.json();
    const parsed = projectSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { error: "Validation failed", details: parsed.error.flatten() },
        { status: 400 }
      );
    }

    const data = parsed.data;
    if (data.repositoryUrl === "") {
      delete data.repositoryUrl;
    }

    const updated = await Project.findByIdAndUpdate(projectId, data, {
      new: true,
      runValidators: true,
    });

    return NextResponse.json(updated, { status: 200 });
  } catch (error) {
    console.error("PUT /api/projects/[projectId] error:", error);
    return NextResponse.json(
      { error: "Failed to update project" },
      { status: 500 }
    );
  }
}

// DELETE /api/projects/:projectId — cascades to tasks + scratchpad
export async function DELETE(
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

    // Cascade delete tasks and scratchpad
    await Task.deleteMany({ projectId });
    await Scratchpad.deleteOne({ projectId });
    await Project.findByIdAndDelete(projectId);

    return NextResponse.json(
      { message: "Project and associated data deleted" },
      { status: 200 }
    );
  } catch (error) {
    console.error("DELETE /api/projects/[projectId] error:", error);
    return NextResponse.json(
      { error: "Failed to delete project" },
      { status: 500 }
    );
  }
}
