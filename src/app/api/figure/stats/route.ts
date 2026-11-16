import { NextRequest, NextResponse } from "next/server";
import { connectDB } from "@/lib/db";
import WorkoutLog from "@/models/figure/WorkoutLog";
import RunLog from "@/models/figure/RunLog";
import { serverError } from "@/lib/api-helpers";
import { computeFitnessStats, rangeStart } from "@/lib/figure/stats";
import { fromDay } from "@/lib/figure/format";

const DAY = /^\d{4}-\d{2}-\d{2}$/;

/**
 * GET /api/figure/stats?weeks=12&today=yyyy-MM-dd
 * `today` comes from the browser so weeks line up with the user's local calendar.
 */
export async function GET(request: NextRequest) {
  try {
    await connectDB();
    const { searchParams } = request.nextUrl;
    const weeks = Math.min(Math.max(Math.round(Number(searchParams.get("weeks")) || 12), 2), 104);
    const todayParam = searchParams.get("today");
    const today = todayParam && DAY.test(todayParam) ? fromDay(todayParam) : new Date();
    const start = rangeStart(today, weeks);

    const [logs, runs, logDays, runDays] = await Promise.all([
      WorkoutLog.find({ date: { $gte: start } }).select("date name exercises").lean(),
      RunLog.find({ date: { $gte: start } }).select("date distance durationSeconds type").lean(),
      WorkoutLog.distinct("date"),
      RunLog.distinct("date"),
    ]);

    const stats = computeFitnessStats(
      logs,
      runs,
      new Set<string>([...logDays, ...runDays]),
      today,
      weeks
    );
    return NextResponse.json(stats, { status: 200 });
  } catch (error) {
    return serverError("GET /api/figure/stats", error, "Failed to compute fitness stats");
  }
}
