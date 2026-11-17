import { serve } from "@/lib/data/serve";

export const PUT = serve("PUT", "/api/future/tours/:tourId");
export const DELETE = serve("DELETE", "/api/future/tours/:tourId");
