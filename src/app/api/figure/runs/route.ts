import { NextRequest, NextResponse } from "next/server";
import { connectDB } from "@/lib/db";
import RunLog from "@/models/figure/RunLog";
import { runLogSchema } from "@/lib/figure/validators";
import { serverError, validationError } from "@/lib/figure/api";

const DAY = /^\d{4}-\d{2}-\d{2}$/;

// GET /api/figure/runs — newest first; optional ?startDate&endDate, ?limit
export async function GET(request: NextRequest) {
  try {
    await connectDB();
    const { searchParams } = request.nextUrl;
    const startDate = searchParams.get("startDate");
    const endDate = searchParams.get("endDate");
    const limit = Math.min(Math.max(Number(searchParams.get("limit")) || 100, 1), 500);

    const range: Record<string, string> = {};
    if (startDate && DAY.test(startDate)) range.$gte = startDate;
    if (endDate && DAY.test(endDate)) range.$lte = endDate;
    const filter = Object.keys(range).length ? { date: range } : {};

    const runs = await RunLog.find(filter).sort({ date: -1, createdAt: -1 }).limit(limit).lean();
    return NextResponse.json(runs, { status: 200 });
  } catch (error) {
    return serverError("GET /api/figure/runs", error, "Failed to fetch runs");
  }
}

// POST /api/figure/runs
export async function POST(request: Request) {
  try {
    await connectDB();
    const parsed = runLogSchema.safeParse(await request.json());
    if (!parsed.success) return validationError(parsed.error);
    const run = await RunLog.create(parsed.data);
    return NextResponse.json(run, { status: 201 });
  } catch (error) {
    return serverError("POST /api/figure/runs", error, "Failed to save run");
  }
}
