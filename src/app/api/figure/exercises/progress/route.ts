import { NextRequest, NextResponse } from "next/server";
import { connectDB } from "@/lib/db";
import WorkoutLog from "@/models/figure/WorkoutLog";
import { escapeRegex, serverError } from "@/lib/api-helpers";
import { computeExerciseProgress } from "@/lib/figure/stats";

const DAY = /^\d{4}-\d{2}-\d{2}$/;

// GET /api/figure/exercises/progress?name=Bench&startDate=yyyy-MM-dd → one point per session
export async function GET(request: NextRequest) {
  try {
    await connectDB();
    const { searchParams } = request.nextUrl;
    const name = searchParams.get("name")?.trim();
    if (!name) return NextResponse.json([], { status: 200 });
    const startDate = searchParams.get("startDate");

    const filter: Record<string, unknown> = {
      "exercises.name": new RegExp(`^\\s*${escapeRegex(name)}\\s*$`, "i"),
    };
    if (startDate && DAY.test(startDate)) filter.date = { $gte: startDate };

    const logs = await WorkoutLog.find(filter).select("date name exercises").sort({ date: 1 }).lean();
    return NextResponse.json(computeExerciseProgress(logs, name), { status: 200 });
  } catch (error) {
    return serverError("GET /api/figure/exercises/progress", error, "Failed to fetch exercise progress");
  }
}
