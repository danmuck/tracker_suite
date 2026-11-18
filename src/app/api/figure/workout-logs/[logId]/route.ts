import { serve } from "@/lib/data/serve";

export const GET = serve("GET", "/api/figure/workout-logs/:logId");
export const PUT = serve("PUT", "/api/figure/workout-logs/:logId");
export const DELETE = serve("DELETE", "/api/figure/workout-logs/:logId");
