import { serve } from "@/lib/data/serve";

export const GET = serve("GET", "/api/transactions/:transactionId");
export const PUT = serve("PUT", "/api/transactions/:transactionId");
export const DELETE = serve("DELETE", "/api/transactions/:transactionId");
