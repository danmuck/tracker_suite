import { NextRequest, NextResponse } from "next/server";
import type { PipelineStage } from "mongoose";
import { connectDB } from "@/lib/db";
import WorkoutLog from "@/models/figure/WorkoutLog";
import { escapeRegex, serverError } from "@/lib/api-helpers";

// GET /api/figure/exercises/history?name=Bench&name=Squat[&before=yyyy-MM-dd][&excludeLogId=]
// → { [lowercased name]: { name, date, sets } } — the most recent logged sets for each exercise
export async function GET(request: NextRequest) {
  try {
    await connectDB();
    const { searchParams } = request.nextUrl;
    const names = [...new Set(searchParams.getAll("name").map((n) => n.trim()).filter(Boolean))].slice(0, 50);
    const before = searchParams.get("before");
    const excludeLogId = searchParams.get("excludeLogId");
    if (names.length === 0) return NextResponse.json({}, { status: 200 });

    const pipeline: PipelineStage[] = [];
    const match: Record<string, unknown> = {};
    if (before && /^\d{4}-\d{2}-\d{2}$/.test(before)) match.date = { $lte: before };
    if (Object.keys(match).length) pipeline.push({ $match: match });

    const nameRegexes = names.map((n) => new RegExp(`^${escapeRegex(n)}$`, "i"));
    pipeline.push(
      { $match: { "exercises.name": { $in: nameRegexes } } },
      { $sort: { date: -1, createdAt: -1 } },
      { $limit: 200 },
      { $unwind: "$exercises" },
      { $match: { "exercises.name": { $in: nameRegexes } } },
      { $project: { _id: 1, date: 1, name: "$exercises.name", sets: "$exercises.sets" } }
    );

    const rows = await WorkoutLog.aggregate(pipeline);
    const result: Record<string, { name: string; date: string; sets: unknown[] }> = {};
    for (const row of rows) {
      if (excludeLogId && String(row._id) === excludeLogId) continue;
      const key = String(row.name).toLowerCase();
      if (!result[key]) result[key] = { name: row.name, date: row.date, sets: row.sets };
    }
    return NextResponse.json(result, { status: 200 });
  } catch (error) {
    return serverError("GET /api/figure/exercises/history", error, "Failed to fetch exercise history");
  }
}
