export interface WorkoutExercise {
  name: string;
  targetSets: number;
  targetReps: number;
  targetWeight?: number;
  notes?: string;
}

export interface Workout {
  _id: string;
  name: string;
  notes?: string;
  exercises: WorkoutExercise[];
  order: number;
  createdAt: string;
  updatedAt: string;
}

export interface WorkoutFormData {
  name: string;
  notes?: string;
  exercises: WorkoutExercise[];
}

export interface LoggedSet {
  reps: number;
  weight: number;
  done: boolean;
}

export interface LoggedExercise {
  name: string;
  sets: LoggedSet[];
}

export interface WorkoutLog {
  _id: string;
  /** Calendar day, yyyy-MM-dd */
  date: string;
  workoutId?: string;
  name: string;
  exercises: LoggedExercise[];
  notes?: string;
  createdAt: string;
  updatedAt: string;
}

export interface WorkoutLogFormData {
  date: string;
  workoutId?: string;
  name: string;
  exercises: LoggedExercise[];
  notes?: string;
}

/** Most recent logged sets for one exercise, used for "last time" hints */
export interface ExerciseHistory {
  name: string;
  date: string;
  sets: LoggedSet[];
}

export type RunType = "easy" | "tempo" | "intervals" | "long" | "race" | "other";

export interface RunLog {
  _id: string;
  /** Calendar day, yyyy-MM-dd */
  date: string;
  /** Miles */
  distance: number;
  /** Total seconds */
  durationSeconds: number;
  type: RunType;
  notes?: string;
  createdAt: string;
  updatedAt: string;
}

export interface RunLogFormData {
  date: string;
  distance: number;
  durationSeconds: number;
  type: RunType;
  notes?: string;
}
