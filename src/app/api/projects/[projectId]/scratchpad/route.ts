import { serve } from "@/lib/data/serve";

export const GET = serve("GET", "/api/projects/:projectId/scratchpad");
export const PUT = serve("PUT", "/api/projects/:projectId/scratchpad");
