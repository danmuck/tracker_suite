import { serve } from "@/lib/data/serve";

export const GET = serve("GET", "/api/accounts/:accountId");
export const PUT = serve("PUT", "/api/accounts/:accountId");
export const PATCH = serve("PATCH", "/api/accounts/:accountId");
export const DELETE = serve("DELETE", "/api/accounts/:accountId");
