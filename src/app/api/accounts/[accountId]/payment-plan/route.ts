import { serve } from "@/lib/data/serve";

export const GET = serve("GET", "/api/accounts/:accountId/payment-plan");
export const POST = serve("POST", "/api/accounts/:accountId/payment-plan");
export const PUT = serve("PUT", "/api/accounts/:accountId/payment-plan");
export const DELETE = serve("DELETE", "/api/accounts/:accountId/payment-plan");
