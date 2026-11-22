import { serve } from "@/lib/data/serve";

export const GET = serve("GET", "/api/figure/workouts/:workoutId");
export const PUT = serve("PUT", "/api/figure/workouts/:workoutId");
export const DELETE = serve("DELETE", "/api/figure/workouts/:workoutId");
