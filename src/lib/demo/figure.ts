// Sample Figure data: an invented training log and recipes, nothing real.
// Dates are relative to `today`: twelve weeks of lifting and running, with a current streak and
// steady progress on the main lifts.

import { addDays, format } from "date-fns";
import type { RecipeFormData, ShoppingItemFormData } from "@/types/figure/diet";
import type { LoggedExercise, RunLogFormData, RunType, WorkoutFormData } from "@/types/figure/fitness";

export type FigureWorkoutKey = "push" | "pull" | "legs";

export interface FigureSampleLog {
  /** The sample workout it was logged from */
  workout: FigureWorkoutKey;
  date: string;
  name: string;
  exercises: LoggedExercise[];
  notes?: string;
}

export interface FigureSample {
  workouts: (WorkoutFormData & { key: FigureWorkoutKey })[];
  logs: FigureSampleLog[];
  runs: RunLogFormData[];
  recipes: RecipeFormData[];
  shopping: {
    /** Items typed onto the list, before the recipe below is added */
    items: ShoppingItemFormData[];
    /** Recipe (by name) whose ingredients go onto the list */
    fromRecipe: string;
    /** Items (by name) checked off afterwards */
    checked: string[];
  };
}

// Days ago, oldest first. Lifting and running together cover every day of the last ten; over the
// last 38 the rest days come singly, at most two in a Sunday–Saturday week, so the current streak is 38 days
// (the rest day before it is the third in its week). Today has both a lift and a run, so "this
// week" is never empty.
const LIFT_DAYS = [77, 70, 65, 63, 58, 56, 53, 51, 49, 46, 44, 42, 39, 37, 35, 32, 30, 28, 25, 23, 21, 18, 16, 14, 11, 9, 7, 4, 2, 0];
const ROTATION: FigureWorkoutKey[] = ["push", "pull", "legs"];

const RUNS: { daysAgo: number; type: RunType; distance: number; pace: number; notes?: string }[] = [
  { daysAgo: 75, type: "easy", distance: 3, pace: 600 },
  { daysAgo: 68, type: "easy", distance: 3.1, pace: 595 },
  { daysAgo: 61, type: "long", distance: 5, pace: 620 },
  { daysAgo: 54, type: "tempo", distance: 3.5, pace: 540 },
  { daysAgo: 47, type: "easy", distance: 3.2, pace: 590 },
  { daysAgo: 40, type: "intervals", distance: 4, pace: 525, notes: "6 × 400 m" },
  { daysAgo: 36, type: "long", distance: 6, pace: 610 },
  { daysAgo: 33, type: "easy", distance: 3, pace: 585 },
  { daysAgo: 29, type: "tempo", distance: 4, pace: 530 },
  { daysAgo: 26, type: "other", distance: 2.5, pace: 660, notes: "Trail loop with hills" },
  { daysAgo: 22, type: "long", distance: 7, pace: 600 },
  { daysAgo: 19, type: "easy", distance: 3.3, pace: 575 },
  { daysAgo: 15, type: "intervals", distance: 4.2, pace: 510, notes: "5 × 800 m" },
  { daysAgo: 12, type: "race", distance: 3.1, pace: 480, notes: "Riverside 5K" },
  { daysAgo: 8, type: "easy", distance: 3, pace: 570 },
  { daysAgo: 6, type: "long", distance: 8, pace: 595 },
  { daysAgo: 5, type: "easy", distance: 2.5, pace: 580 },
  { daysAgo: 3, type: "tempo", distance: 4, pace: 520 },
  { daysAgo: 1, type: "easy", distance: 3, pace: 565 },
  { daysAgo: 0, type: "easy", distance: 2, pace: 570, notes: "Shakeout before lifting" },
];

/** Weight for the `n`th session (from 0) of a lift: `start`, plus `step` every `every` sessions. */
const progress = (start: number, step: number, every: number) => (n: number) => start + step * Math.floor(n / every);
const sets = (count: number, reps: number, weight: number) =>
  Array.from({ length: count }, () => ({ reps, weight, done: true }));

// Each lift: name, sets × reps, and its weight by session. Bench press, back squat and deadlift
// climb steadily; the rest move a little.
const LIFTS: Record<FigureWorkoutKey, { name: string; sets: number; reps: number; weight: (n: number) => number }[]> = {
  push: [
    { name: "Bench Press", sets: 3, reps: 5, weight: progress(135, 5, 1) },
    { name: "Overhead Press", sets: 3, reps: 8, weight: progress(75, 5, 3) },
    { name: "Incline Dumbbell Press", sets: 3, reps: 10, weight: progress(40, 5, 4) },
    { name: "Triceps Pushdown", sets: 3, reps: 12, weight: progress(40, 5, 5) },
  ],
  pull: [
    { name: "Deadlift", sets: 3, reps: 5, weight: progress(205, 10, 1) },
    { name: "Barbell Row", sets: 3, reps: 8, weight: progress(115, 5, 2) },
    { name: "Pull-up", sets: 3, reps: 8, weight: () => 0 },
    { name: "Biceps Curl", sets: 3, reps: 12, weight: progress(25, 5, 5) },
  ],
  legs: [
    { name: "Back Squat", sets: 3, reps: 5, weight: progress(165, 5, 1) },
    { name: "Romanian Deadlift", sets: 3, reps: 8, weight: progress(135, 10, 3) },
    { name: "Leg Press", sets: 3, reps: 10, weight: progress(230, 20, 3) },
    { name: "Calf Raise", sets: 3, reps: 15, weight: progress(90, 10, 4) },
  ],
};

const WORKOUT_NAMES: Record<FigureWorkoutKey, string> = { push: "Push Day", pull: "Pull Day", legs: "Leg Day" };
// By index into LIFT_DAYS (push, pull, legs in turn): a pull, a leg and the latest push session
const LOG_NOTES: Record<number, string> = {
  13: "Felt strong, bar speed good",
  20: "Short on sleep, kept it easy on accessories",
  27: "New best on bench",
};

export function figureSample(today: Date): FigureSample {
  const day = (daysAgo: number) => format(addDays(today, -daysAgo), "yyyy-MM-dd");
  const sessions: Record<FigureWorkoutKey, number> = { push: 0, pull: 0, legs: 0 };
  const total = (key: FigureWorkoutKey) => LIFT_DAYS.filter((_, i) => ROTATION[i % 3] === key).length;

  return {
    workouts: ROTATION.map((key) => ({
      key,
      name: WORKOUT_NAMES[key],
      ...(key === "legs" ? { notes: "Warm up with two light squat sets first" } : {}),
      exercises: LIFTS[key].map((l) => ({
        name: l.name,
        targetSets: l.sets,
        targetReps: l.reps,
        // The definition carries the weight of the latest session
        ...(l.weight(total(key) - 1) > 0 ? { targetWeight: l.weight(total(key) - 1) } : {}),
      })),
    })),
    logs: LIFT_DAYS.map((daysAgo, i) => {
      const key = ROTATION[i % 3];
      const n = sessions[key]++;
      return {
        workout: key,
        date: day(daysAgo),
        name: WORKOUT_NAMES[key],
        exercises: LIFTS[key].map((l) => ({ name: l.name, sets: sets(l.sets, l.reps, l.weight(n)) })),
        ...(LOG_NOTES[i] ? { notes: LOG_NOTES[i] } : {}),
      };
    }),
    runs: RUNS.map((r) => ({
      date: day(r.daysAgo),
      distance: r.distance,
      durationSeconds: Math.round(r.distance * r.pace),
      type: r.type,
      ...(r.notes ? { notes: r.notes } : {}),
    })),
    recipes: [
      {
        name: "Chicken Burrito Bowl",
        servings: 4,
        ingredients: [
          { name: "Chicken thighs", quantity: 1.5, unit: "lb" },
          { name: "Brown rice", quantity: 1, unit: "cup" },
          { name: "Black beans", quantity: 1, unit: "can" },
          { name: "Salsa", quantity: 1, unit: "jar" },
          { name: "Limes", quantity: 2 },
        ],
        instructions:
          "Cook the rice. Season and grill the chicken, then slice. Warm the beans. Build bowls with rice, beans, chicken and salsa; finish with lime.",
        tags: ["dinner", "high-protein", "meal-prep"],
      },
      {
        name: "Overnight Oats",
        servings: 1,
        ingredients: [
          { name: "Rolled oats", quantity: 0.5, unit: "cup" },
          { name: "Milk", quantity: 0.5, unit: "cup" },
          { name: "Greek yogurt", quantity: 0.25, unit: "cup" },
          { name: "Chia seeds", quantity: 1, unit: "tbsp" },
          { name: "Blueberries" },
        ],
        instructions: "Stir everything but the berries together in a jar. Refrigerate overnight; top with berries.",
        tags: ["breakfast", "quick"],
      },
      {
        name: "Red Lentil Soup",
        servings: 6,
        ingredients: [
          { name: "Red lentils", quantity: 2, unit: "cup" },
          { name: "Onion", quantity: 1 },
          { name: "Carrots", quantity: 2 },
          { name: "Vegetable broth", quantity: 6, unit: "cup" },
          { name: "Cumin", quantity: 1, unit: "tsp" },
          { name: "Lemon", quantity: 1 },
        ],
        instructions:
          "Soften the onion and carrots in a little oil. Add cumin, lentils and broth; simmer 25 minutes. Blend half, stir back in, and finish with lemon juice.",
        tags: ["dinner", "vegetarian", "meal-prep"],
      },
      {
        name: "Salmon with Roasted Vegetables",
        servings: 2,
        ingredients: [
          { name: "Salmon fillets", quantity: 2 },
          { name: "Broccoli", quantity: 1, unit: "head" },
          { name: "Sweet potato", quantity: 1 },
          { name: "Olive oil", quantity: 2, unit: "tbsp" },
          { name: "Salt" },
        ],
        instructions:
          "Roast the cubed sweet potato at 425°F for 15 minutes. Add broccoli and salmon, drizzle with oil, season, and roast 12 minutes more.",
        tags: ["dinner", "high-protein"],
      },
      {
        name: "Protein Smoothie",
        servings: 1,
        ingredients: [
          { name: "Banana", quantity: 1 },
          { name: "Peanut butter", quantity: 1, unit: "tbsp" },
          { name: "Milk", quantity: 1, unit: "cup" },
          { name: "Protein powder", quantity: 1, unit: "scoop" },
        ],
        instructions: "Blend until smooth.",
        tags: ["breakfast", "high-protein", "quick"],
      },
    ],
    shopping: {
      items: [
        { name: "Bananas", quantity: 6 },
        { name: "Greek yogurt", quantity: 32, unit: "oz" },
        { name: "Coffee beans", quantity: 1, unit: "bag" },
        { name: "Spinach", quantity: 1, unit: "bag" },
      ],
      fromRecipe: "Chicken Burrito Bowl",
      checked: ["Bananas", "Coffee beans", "Limes"],
    },
  };
}
