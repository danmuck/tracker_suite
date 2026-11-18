import { serve } from "@/lib/data/serve";

export const GET = serve("GET", "/api/projects/:projectId");
export const PUT = serve("PUT", "/api/projects/:projectId");
export const DELETE = serve("DELETE", "/api/projects/:projectId");
