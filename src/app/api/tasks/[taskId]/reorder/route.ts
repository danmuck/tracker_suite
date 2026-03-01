import { NextRequest, NextResponse } from "next/server";
import { connectDB } from "@/lib/db";
import Task from "@/models/projects/Task";
import { taskReorderSchema } from "@/lib/projects/validators";

// PATCH /api/tasks/:taskId/reorder — move task to a new status/order
export async function PATCH(
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

    const body = await request.json();
    const parsed = taskReorderSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { error: "Validation failed", details: parsed.error.flatten() },
        { status: 400 }
      );
    }

    const { status: newStatus, order: newOrder } = parsed.data;
    const oldStatus = task.status;
    const oldOrder = task.order;

    if (oldStatus === newStatus) {
      // Reorder within the same column
      if (newOrder > oldOrder) {
        // Moving down: shift items between old+1..new up by 1
        await Task.updateMany(
          {
            projectId: task.projectId,
            status: oldStatus,
            order: { $gt: oldOrder, $lte: newOrder },
          },
          { $inc: { order: -1 } }
        );
      } else if (newOrder < oldOrder) {
        // Moving up: shift items between new..old-1 down by 1
        await Task.updateMany(
          {
            projectId: task.projectId,
            status: oldStatus,
            order: { $gte: newOrder, $lt: oldOrder },
          },
          { $inc: { order: 1 } }
        );
      }
    } else {
      // Moving to a different column
      // Close the gap in the old column
      await Task.updateMany(
        {
          projectId: task.projectId,
          status: oldStatus,
          order: { $gt: oldOrder },
        },
        { $inc: { order: -1 } }
      );
      // Make space in the new column
      await Task.updateMany(
        {
          projectId: task.projectId,
          status: newStatus,
          order: { $gte: newOrder },
        },
        { $inc: { order: 1 } }
      );
    }

    // Update the task itself
    const updated = await Task.findByIdAndUpdate(
      taskId,
      { status: newStatus, order: newOrder },
      { new: true, runValidators: true }
    );

    return NextResponse.json(updated, { status: 200 });
  } catch (error) {
    console.error("PATCH /api/tasks/[taskId]/reorder error:", error);
    return NextResponse.json(
      { error: "Failed to reorder task" },
      { status: 500 }
    );
  }
}
