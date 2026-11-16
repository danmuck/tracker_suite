import { NextResponse } from "next/server";
import { connectDB } from "@/lib/db";
import Workout from "@/models/figure/Workout";
import { workoutSchema } from "@/lib/figure/validators";
import { serverError, validationError } from "@/lib/api-helpers";

// GET /api/figure/workouts — list workout definitions
export async function GET() {
  try {
    await connectDB();
    const workouts = await Workout.find().sort({ order: 1, createdAt: 1 }).lean();
    return NextResponse.json(workouts, { status: 200 });
  } catch (error) {
    return serverError("GET /api/figure/workouts", error, "Failed to fetch workouts");
  }
}

// POST /api/figure/workouts — create a workout definition
export async function POST(request: Request) {
  try {
    await connectDB();
    const parsed = workoutSchema.safeParse(await request.json());
    if (!parsed.success) return validationError(parsed.error);

    const last = await Workout.findOne().sort({ order: -1 }).select("order").lean();
    const workout = await Workout.create({ ...parsed.data, order: (last?.order ?? -1) + 1 });
    return NextResponse.json(workout, { status: 201 });
  } catch (error) {
    return serverError("POST /api/figure/workouts", error, "Failed to create workout");
  }
}
