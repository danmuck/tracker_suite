import { NextResponse } from "next/server";
import { connectDB } from "@/lib/db";
import Workout from "@/models/figure/Workout";
import { workoutSchema } from "@/lib/figure/validators";
import { isValidObjectId, notFound, serverError, validationError } from "@/lib/figure/api";

type Ctx = { params: Promise<{ workoutId: string }> };

// GET /api/figure/workouts/:workoutId
export async function GET(_request: Request, { params }: Ctx) {
  try {
    await connectDB();
    const { workoutId } = await params;
    if (!isValidObjectId(workoutId)) return notFound("Workout");
    const workout = await Workout.findById(workoutId).lean();
    if (!workout) return notFound("Workout");
    return NextResponse.json(workout, { status: 200 });
  } catch (error) {
    return serverError("GET /api/figure/workouts/[workoutId]", error, "Failed to fetch workout");
  }
}

// PUT /api/figure/workouts/:workoutId — edits the definition only; past logs keep their snapshot
export async function PUT(request: Request, { params }: Ctx) {
  try {
    await connectDB();
    const { workoutId } = await params;
    if (!isValidObjectId(workoutId)) return notFound("Workout");
    const parsed = workoutSchema.safeParse(await request.json());
    if (!parsed.success) return validationError(parsed.error);

    const updated = await Workout.findByIdAndUpdate(workoutId, parsed.data, {
      new: true,
      runValidators: true,
    });
    if (!updated) return notFound("Workout");
    return NextResponse.json(updated, { status: 200 });
  } catch (error) {
    return serverError("PUT /api/figure/workouts/[workoutId]", error, "Failed to update workout");
  }
}

// DELETE /api/figure/workouts/:workoutId — logs made from it are kept
export async function DELETE(_request: Request, { params }: Ctx) {
  try {
    await connectDB();
    const { workoutId } = await params;
    if (!isValidObjectId(workoutId)) return notFound("Workout");
    const deleted = await Workout.findByIdAndDelete(workoutId);
    if (!deleted) return notFound("Workout");
    return NextResponse.json({ message: "Workout deleted" }, { status: 200 });
  } catch (error) {
    return serverError("DELETE /api/figure/workouts/[workoutId]", error, "Failed to delete workout");
  }
}
