import { z } from "zod";

const optionalNumber = z.number().nonnegative().optional();

export const workoutExerciseSchema = z.object({
  name: z.string().trim().min(1, "Exercise name is required").max(100),
  targetSets: z.number().int().min(1).max(50),
  targetReps: z.number().int().min(0).max(1000),
  targetWeight: optionalNumber,
  notes: z.string().max(500).optional(),
});

export const workoutSchema = z.object({
  name: z.string().trim().min(1, "Name is required").max(100),
  notes: z.string().max(2000).optional(),
  exercises: z.array(workoutExerciseSchema).default([]),
});

export const loggedSetSchema = z.object({
  reps: z.number().int().min(0).max(1000),
  weight: z.number().nonnegative().max(10000),
  done: z.boolean().default(true),
});

export const workoutLogSchema = z.object({
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Date must be yyyy-MM-dd"),
  workoutId: z.string().optional(),
  name: z.string().trim().min(1, "Name is required").max(100),
  exercises: z
    .array(
      z.object({
        name: z.string().trim().min(1, "Exercise name is required").max(100),
        sets: z.array(loggedSetSchema).default([]),
      })
    )
    .default([]),
  notes: z.string().max(2000).optional(),
});

export const ingredientSchema = z.object({
  name: z.string().trim().min(1, "Ingredient name is required").max(100),
  quantity: optionalNumber,
  unit: z.string().trim().max(30).optional(),
});

export const recipeSchema = z.object({
  name: z.string().trim().min(1, "Name is required").max(150),
  servings: z.number().int().min(1).max(100).optional(),
  ingredients: z.array(ingredientSchema).default([]),
  instructions: z.string().max(20000).default(""),
  tags: z.array(z.string().trim().min(1).max(40)).default([]),
});

export const shoppingItemSchema = z.object({
  name: z.string().trim().min(1, "Name is required").max(100),
  quantity: optionalNumber,
  unit: z.string().trim().max(30).optional(),
  checked: z.boolean().default(false),
});

export const shoppingItemUpdateSchema = shoppingItemSchema.partial();

export type WorkoutInput = z.infer<typeof workoutSchema>;
export type WorkoutLogInput = z.infer<typeof workoutLogSchema>;
export type RecipeInput = z.infer<typeof recipeSchema>;
export type ShoppingItemInput = z.infer<typeof shoppingItemSchema>;

export const RUN_TYPES = ["easy", "tempo", "intervals", "long", "race", "other"] as const;

export const runLogSchema = z.object({
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Date must be yyyy-MM-dd"),
  distance: z.number().positive("Distance must be more than 0").max(1000),
  durationSeconds: z.number().int().positive("Time must be more than 0").max(7 * 24 * 3600),
  type: z.enum(RUN_TYPES).default("easy"),
  notes: z.string().max(2000).optional(),
});

export type RunLogInput = z.infer<typeof runLogSchema>;
