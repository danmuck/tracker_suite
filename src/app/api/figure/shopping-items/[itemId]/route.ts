import { serve } from "@/lib/data/serve";

export const PUT = serve("PUT", "/api/figure/shopping-items/:itemId");
export const DELETE = serve("DELETE", "/api/figure/shopping-items/:itemId");
