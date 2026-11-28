import mongoose, { Schema, Document, Model } from "mongoose";

export interface IWorkoutLog extends Document {
  ownerId?: string;
  /** Calendar day, yyyy-MM-dd (string so it never shifts with timezone) */
  date: string;
  workoutId?: mongoose.Types.ObjectId;
  name: string;
  exercises: {
    name: string;
    sets: { reps: number; weight: number; done: boolean }[];
  }[];
  notes?: string;
  createdAt: Date;
  updatedAt: Date;
}

const LoggedSetSchema = new Schema(
  {
    reps: { type: Number, required: true, min: 0 },
    weight: { type: Number, required: true, min: 0 },
    done: { type: Boolean, default: false },
  },
  { _id: false }
);

const LoggedExerciseSchema = new Schema(
  {
    name: { type: String, required: true, trim: true },
    sets: { type: [LoggedSetSchema], default: [] },
  },
  { _id: false }
);

const WorkoutLogSchema = new Schema<IWorkoutLog>(
  {
    ownerId: { type: String },
    date: { type: String, required: true, match: /^\d{4}-\d{2}-\d{2}$/ },
    workoutId: { type: Schema.Types.ObjectId, ref: "Workout" },
    name: { type: String, required: true, trim: true },
    exercises: { type: [LoggedExerciseSchema], default: [] },
    notes: { type: String, trim: true },
  },
  { timestamps: true }
);

WorkoutLogSchema.index({ ownerId: 1, date: -1, createdAt: -1 });
WorkoutLogSchema.index({ ownerId: 1, "exercises.name": 1 });

if (process.env.NODE_ENV !== "production" && mongoose.models.WorkoutLog) {
  delete mongoose.models.WorkoutLog;
}

const WorkoutLog: Model<IWorkoutLog> =
  mongoose.models.WorkoutLog || mongoose.model<IWorkoutLog>("WorkoutLog", WorkoutLogSchema);

export default WorkoutLog;
