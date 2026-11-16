"use client";

import { useState } from "react";
import Markdown from "react-markdown";
import { Loader2, Pencil, ShoppingCart, Trash2 } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { formatQuantity } from "@/lib/figure/format";
import type { Recipe } from "@/types/figure/diet";

interface RecipeDetailProps {
  recipe: Recipe;
  onAddToList: (r: Recipe) => Promise<void>;
  onEdit: (r: Recipe) => void;
  onDelete: (r: Recipe) => void;
}

export function RecipeDetail({ recipe, onAddToList, onEdit, onDelete }: RecipeDetailProps) {
  const [adding, setAdding] = useState(false);

  async function add() {
    setAdding(true);
    try {
      await onAddToList(recipe);
    } finally {
      setAdding(false);
    }
  }

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center gap-2">
        {recipe.servings && <span className="text-sm text-muted-foreground">Serves {recipe.servings}</span>}
        {recipe.tags.map((t) => (
          <Badge key={t} variant="secondary">
            {t}
          </Badge>
        ))}
      </div>

      <section className="space-y-2">
        <h3 className="text-sm font-medium">Ingredients</h3>
        {recipe.ingredients.length === 0 ? (
          <p className="text-sm text-muted-foreground">No ingredients listed</p>
        ) : (
          <ul className="space-y-1 text-sm">
            {recipe.ingredients.map((i, idx) => (
              <li key={idx} className="flex gap-3">
                <span className="w-20 shrink-0 tabular-nums text-muted-foreground">
                  {formatQuantity(i.quantity, i.unit)}
                </span>
                <span>{i.name}</span>
              </li>
            ))}
          </ul>
        )}
      </section>

      {recipe.instructions.trim() && (
        <section className="space-y-2">
          <h3 className="text-sm font-medium">Instructions</h3>
          <div className="max-h-[40vh] overflow-y-auto text-sm leading-relaxed [&_h1]:font-semibold [&_h2]:font-semibold [&_h3]:font-semibold [&_li]:mb-1 [&_ol]:list-decimal [&_ol]:pl-5 [&_p]:mb-2 [&_ul]:list-disc [&_ul]:pl-5">
            <Markdown>{recipe.instructions}</Markdown>
          </div>
        </section>
      )}

      <div className="flex flex-wrap justify-between gap-2 border-t pt-4">
        <div className="flex gap-2">
          <Button variant="outline" size="sm" onClick={() => onEdit(recipe)}>
            <Pencil className="mr-1 h-4 w-4" />
            Edit
          </Button>
          <Button variant="ghost" size="sm" className="text-destructive" onClick={() => onDelete(recipe)}>
            <Trash2 className="mr-1 h-4 w-4" />
            Delete
          </Button>
        </div>
        <Button size="sm" onClick={add} disabled={adding || recipe.ingredients.length === 0}>
          {adding ? <Loader2 className="mr-1 h-4 w-4 animate-spin" /> : <ShoppingCart className="mr-1 h-4 w-4" />}
          Add to shopping list
        </Button>
      </div>
    </div>
  );
}
