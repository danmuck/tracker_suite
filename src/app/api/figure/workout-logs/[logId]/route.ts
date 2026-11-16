import { NextResponse } from "next/server";
import { connectDB } from "@/lib/db";
import WorkoutLog from "@/models/figure/WorkoutLog";
import { workoutLogSchema } from "@/lib/figure/validators";
import { isValidObjectId, notFound, serverError, validationError } from "@/lib/figure/api";

type Ctx = { params: Promise<{ logId: string }> };

// GET /api/figure/workout-logs/:logId
export async function GET(_request: Request, { params }: Ctx) {
  try {
    await connectDB();
    const { logId } = await params;
    if (!isValidObjectId(logId)) return notFound("Workout log");
    const log = await WorkoutLog.findById(logId).lean();
    if (!log) return notFound("Workout log");
    return NextResponse.json(log, { status: 200 });
  } catch (error) {
    return serverError("GET /api/figure/workout-logs/[logId]", error, "Failed to fetch workout log");
  }
}

// PUT /api/figure/workout-logs/:logId
export async function PUT(request: Request, { params }: Ctx) {
  try {
    await connectDB();
    const { logId } = await params;
    if (!isValidObjectId(logId)) return notFound("Workout log");
    const parsed = workoutLogSchema.safeParse(await request.json());
    if (!parsed.success) return validationError(parsed.error);

    const { workoutId, ...rest } = parsed.data;
    const update =
      workoutId && isValidObjectId(workoutId)
        ? { $set: { ...rest, workoutId } }
        : { $set: rest, $unset: { workoutId: 1 } };

    const updated = await WorkoutLog.findByIdAndUpdate(logId, update, {
      new: true,
      runValidators: true,
    });
    if (!updated) return notFound("Workout log");
    return NextResponse.json(updated, { status: 200 });
  } catch (error) {
    return serverError("PUT /api/figure/workout-logs/[logId]", error, "Failed to update workout log");
  }
}

// DELETE /api/figure/workout-logs/:logId
export async function DELETE(_request: Request, { params }: Ctx) {
  try {
    await connectDB();
    const { logId } = await params;
    if (!isValidObjectId(logId)) return notFound("Workout log");
    const deleted = await WorkoutLog.findByIdAndDelete(logId);
    if (!deleted) return notFound("Workout log");
    return NextResponse.json({ message: "Workout log deleted" }, { status: 200 });
  } catch (error) {
    return serverError("DELETE /api/figure/workout-logs/[logId]", error, "Failed to delete workout log");
  }
}
