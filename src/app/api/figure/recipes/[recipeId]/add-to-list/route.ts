import { serve } from "@/lib/data/serve";

export const POST = serve("POST", "/api/figure/recipes/:recipeId/add-to-list");
