"use client";

import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import type { Recipe } from "@/types/figure/diet";

interface RecipeCardProps {
  recipe: Recipe;
  onOpen: (r: Recipe) => void;
}

export function RecipeCard({ recipe, onOpen }: RecipeCardProps) {
  return (
    <Card
      role="button"
      tabIndex={0}
      onClick={() => onOpen(recipe)}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          onOpen(recipe);
        }
      }}
      className="cursor-pointer gap-3 py-4 transition-colors hover:bg-accent/50 focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
    >
      <CardHeader className="px-4">
        <CardTitle className="text-base">{recipe.name}</CardTitle>
        <p className="text-xs text-muted-foreground">
          {recipe.ingredients.length} ingredient{recipe.ingredients.length !== 1 ? "s" : ""}
          {recipe.servings ? ` · serves ${recipe.servings}` : ""}
        </p>
      </CardHeader>
      {recipe.tags.length > 0 && (
        <CardContent className="flex flex-wrap gap-1 px-4">
          {recipe.tags.map((t) => (
            <Badge key={t} variant="secondary">
              {t}
            </Badge>
          ))}
        </CardContent>
      )}
    </Card>
  );
}
