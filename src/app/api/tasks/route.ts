import { NextRequest, NextResponse } from "next/server";
import { connectDB } from "@/lib/db";
import Task from "@/models/projects/Task";
import { taskSchema } from "@/lib/projects/validators";

// GET /api/tasks — list tasks, required ?projectId= filter
export async function GET(request: NextRequest) {
  try {
    await connectDB();

    const { searchParams } = request.nextUrl;
    const projectId = searchParams.get("projectId");

    if (!projectId) {
      return NextResponse.json(
        { error: "projectId query parameter is required" },
        { status: 400 }
      );
    }

    const tasks = await Task.find({ projectId }).sort({ status: 1, order: 1 });

    return NextResponse.json(tasks, { status: 200 });
  } catch (error) {
    console.error("GET /api/tasks error:", error);
    return NextResponse.json(
      { error: "Failed to fetch tasks" },
      { status: 500 }
    );
  }
}

// POST /api/tasks — create a new task
export async function POST(request: NextRequest) {
  try {
    await connectDB();

    const body = await request.json();
    const parsed = taskSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { error: "Validation failed", details: parsed.error.flatten() },
        { status: 400 }
      );
    }

    const data = parsed.data;

    // Auto-assign order: place at end of the target status column
    const maxOrderTask = await Task.findOne({
      projectId: data.projectId,
      status: data.status,
    }).sort({ order: -1 });

    const order = maxOrderTask ? maxOrderTask.order + 1 : 0;

    const task = await Task.create({ ...data, order });

    return NextResponse.json(task, { status: 201 });
  } catch (error) {
    console.error("POST /api/tasks error:", error);
    return NextResponse.json(
      { error: "Failed to create task" },
      { status: 500 }
    );
  }
}
