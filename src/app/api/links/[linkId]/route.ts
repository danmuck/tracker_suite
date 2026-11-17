import { serve } from "@/lib/data/serve";

export const GET = serve("GET", "/api/links/:linkId");
export const PUT = serve("PUT", "/api/links/:linkId");
export const DELETE = serve("DELETE", "/api/links/:linkId");
