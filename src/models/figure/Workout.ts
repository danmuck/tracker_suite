import mongoose, { Schema, Document, Model } from "mongoose";

export interface IWorkout extends Document {
  ownerId?: string;
  name: string;
  notes?: string;
  exercises: {
    name: string;
    targetSets: number;
    targetReps: number;
    targetWeight?: number;
    notes?: string;
  }[];
  order: number;
  createdAt: Date;
  updatedAt: Date;
}

const WorkoutExerciseSchema = new Schema(
  {
    name: { type: String, required: true, trim: true },
    targetSets: { type: Number, required: true, min: 1 },
    targetReps: { type: Number, required: true, min: 0 },
    targetWeight: { type: Number, min: 0 },
    notes: { type: String, trim: true },
  },
  { _id: false }
);

const WorkoutSchema = new Schema<IWorkout>(
  {
    ownerId: { type: String },
    name: { type: String, required: true, trim: true },
    notes: { type: String, trim: true },
    exercises: { type: [WorkoutExerciseSchema], default: [] },
    order: { type: Number, default: 0 },
  },
  { timestamps: true }
);

WorkoutSchema.index({ ownerId: 1 });

if (process.env.NODE_ENV !== "production" && mongoose.models.Workout) {
  delete mongoose.models.Workout;
}

const Workout: Model<IWorkout> =
  mongoose.models.Workout || mongoose.model<IWorkout>("Workout", WorkoutSchema);

export default Workout;
