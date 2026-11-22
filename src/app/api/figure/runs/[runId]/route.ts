import { serve } from "@/lib/data/serve";

export const PUT = serve("PUT", "/api/figure/runs/:runId");
export const DELETE = serve("DELETE", "/api/figure/runs/:runId");
