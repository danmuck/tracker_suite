import { NextRequest, NextResponse } from "next/server";
import { connectDB } from "@/lib/db";
import Task from "@/models/projects/Task";
import { taskSchema } from "@/lib/projects/validators";

// PUT /api/tasks/:taskId
export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ taskId: string }> }
) {
  try {
    await connectDB();
    const { taskId } = await params;

    const existing = await Task.findById(taskId);
    if (!existing) {
      return NextResponse.json({ error: "Task not found" }, { status: 404 });
    }

    const body = await request.json();
    const parsed = taskSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { error: "Validation failed", details: parsed.error.flatten() },
        { status: 400 }
      );
    }

    const updated = await Task.findByIdAndUpdate(taskId, parsed.data, {
      new: true,
      runValidators: true,
    });

    return NextResponse.json(updated, { status: 200 });
  } catch (error) {
    console.error("PUT /api/tasks/[taskId] error:", error);
    return NextResponse.json(
      { error: "Failed to update task" },
      { status: 500 }
    );
  }
}

// DELETE /api/tasks/:taskId
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ taskId: string }> }
) {
  try {
    await connectDB();
    const { taskId } = await params;

    const task = await Task.findById(taskId);
    if (!task) {
      return NextResponse.json({ error: "Task not found" }, { status: 404 });
    }

    await Task.findByIdAndDelete(taskId);

    return NextResponse.json({ message: "Task deleted" }, { status: 200 });
  } catch (error) {
    console.error("DELETE /api/tasks/[taskId] error:", error);
    return NextResponse.json(
      { error: "Failed to delete task" },
      { status: 500 }
    );
  }
}
