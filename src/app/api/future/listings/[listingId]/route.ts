import { serve } from "@/lib/data/serve";

export const PUT = serve("PUT", "/api/future/listings/:listingId");
export const PATCH = serve("PATCH", "/api/future/listings/:listingId");
export const DELETE = serve("DELETE", "/api/future/listings/:listingId");
