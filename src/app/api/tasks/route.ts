import { serve } from "@/lib/data/serve";

export const GET = serve("GET", "/api/tasks");
export const POST = serve("POST", "/api/tasks");
