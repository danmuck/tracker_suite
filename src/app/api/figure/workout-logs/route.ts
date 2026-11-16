import { NextRequest, NextResponse } from "next/server";
import { connectDB } from "@/lib/db";
import WorkoutLog from "@/models/figure/WorkoutLog";
import { workoutLogSchema } from "@/lib/figure/validators";
import { isValidObjectId, serverError, validationError } from "@/lib/figure/api";

const DAY = /^\d{4}-\d{2}-\d{2}$/;

// GET /api/figure/workout-logs — ?date=yyyy-MM-dd, or ?startDate&endDate, plus ?limit
export async function GET(request: NextRequest) {
  try {
    await connectDB();
    const { searchParams } = request.nextUrl;
    const date = searchParams.get("date");
    const startDate = searchParams.get("startDate");
    const endDate = searchParams.get("endDate");
    const limit = Math.min(Math.max(Number(searchParams.get("limit")) || 50, 1), 200);

    const filter: Record<string, unknown> = {};
    if (date && DAY.test(date)) {
      filter.date = date;
    } else {
      const range: Record<string, string> = {};
      if (startDate && DAY.test(startDate)) range.$gte = startDate;
      if (endDate && DAY.test(endDate)) range.$lte = endDate;
      if (Object.keys(range).length) filter.date = range;
    }

    const logs = await WorkoutLog.find(filter).sort({ date: -1, createdAt: -1 }).limit(limit).lean();
    return NextResponse.json(logs, { status: 200 });
  } catch (error) {
    return serverError("GET /api/figure/workout-logs", error, "Failed to fetch workout logs");
  }
}

// POST /api/figure/workout-logs — record a completed workout
export async function POST(request: Request) {
  try {
    await connectDB();
    const parsed = workoutLogSchema.safeParse(await request.json());
    if (!parsed.success) return validationError(parsed.error);

    const data = { ...parsed.data };
    if (!data.workoutId || !isValidObjectId(data.workoutId)) delete data.workoutId;

    const log = await WorkoutLog.create(data);
    return NextResponse.json(log, { status: 201 });
  } catch (error) {
    return serverError("POST /api/figure/workout-logs", error, "Failed to save workout log");
  }
}
