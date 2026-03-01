import { NextRequest, NextResponse } from "next/server";
import { connectDB } from "@/lib/db";
import Project from "@/models/projects/Project";
import Task from "@/models/projects/Task";
import { projectSchema } from "@/lib/projects/validators";

// GET /api/projects — list projects, optional ?status= filter
export async function GET(request: NextRequest) {
  try {
    await connectDB();

    const { searchParams } = request.nextUrl;
    const status = searchParams.get("status");

    const filter: Record<string, string> = {};
    if (status) {
      filter.status = status;
    }

    const projects = await Project.find(filter).sort({ createdAt: -1 }).lean();

    // Aggregate task counts per project
    const projectIds = projects.map((p) => p._id);
    const taskCounts = await Task.aggregate([
      { $match: { projectId: { $in: projectIds } } },
      {
        $group: {
          _id: "$projectId",
          total: { $sum: 1 },
          done: { $sum: { $cond: [{ $eq: ["$status", "done"] }, 1, 0] } },
        },
      },
    ]);

    const countsMap = new Map(
      taskCounts.map((tc) => [tc._id.toString(), { total: tc.total, done: tc.done }])
    );

    const result = projects.map((p) => ({
      ...p,
      taskCounts: countsMap.get(p._id.toString()) || { total: 0, done: 0 },
    }));

    return NextResponse.json(result, { status: 200 });
  } catch (error) {
    console.error("GET /api/projects error:", error);
    return NextResponse.json(
      { error: "Failed to fetch projects" },
      { status: 500 }
    );
  }
}

// POST /api/projects — create a new project
export async function POST(request: NextRequest) {
  try {
    await connectDB();

    const body = await request.json();

    const parsed = projectSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { error: "Validation failed", details: parsed.error.flatten() },
        { status: 400 }
      );
    }

    const data = parsed.data;

    // Strip empty repositoryUrl
    if (data.repositoryUrl === "") {
      delete data.repositoryUrl;
    }

    const project = await Project.create(data);

    return NextResponse.json(project, { status: 201 });
  } catch (error) {
    console.error("POST /api/projects error:", error);
    return NextResponse.json(
      { error: "Failed to create project" },
      { status: 500 }
    );
  }
}
