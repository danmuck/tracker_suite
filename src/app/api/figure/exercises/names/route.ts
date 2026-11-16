import { NextResponse } from "next/server";
import { connectDB } from "@/lib/db";
import Workout from "@/models/figure/Workout";
import WorkoutLog from "@/models/figure/WorkoutLog";
import { serverError } from "@/lib/api-helpers";

// GET /api/figure/exercises/names — every exercise name used so far, for autocomplete
export async function GET() {
  try {
    await connectDB();
    const [fromWorkouts, fromLogs] = await Promise.all([
      Workout.distinct("exercises.name"),
      WorkoutLog.distinct("exercises.name"),
    ]);
    const byKey = new Map<string, string>();
    for (const n of [...fromWorkouts, ...fromLogs] as string[]) {
      const key = n.toLowerCase();
      if (!byKey.has(key)) byKey.set(key, n);
    }
    const names = [...byKey.values()].sort((a, b) => a.localeCompare(b));
    return NextResponse.json(names, { status: 200 });
  } catch (error) {
    return serverError("GET /api/figure/exercises/names", error, "Failed to fetch exercise names");
  }
}
