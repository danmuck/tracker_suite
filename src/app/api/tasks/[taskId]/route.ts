import { serve } from "@/lib/data/serve";

export const PUT = serve("PUT", "/api/tasks/:taskId");
export const DELETE = serve("DELETE", "/api/tasks/:taskId");
