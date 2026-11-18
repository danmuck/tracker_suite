import { serve } from "@/lib/data/serve";

export const GET = serve("GET", "/api/figure/recipes/:recipeId");
export const PUT = serve("PUT", "/api/figure/recipes/:recipeId");
export const DELETE = serve("DELETE", "/api/figure/recipes/:recipeId");
