"use client";

import { useState } from "react";
import { Loader2, Plus, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { parseOptionalNumber } from "@/lib/figure/format";
import type { Recipe, RecipeFormData } from "@/types/figure/diet";

interface Row {
  key: number;
  quantity: string;
  unit: string;
  name: string;
}

let rowKey = 0;
const blankRow = (): Row => ({ key: rowKey++, quantity: "", unit: "", name: "" });

interface RecipeFormProps {
  defaultValues?: Recipe;
  onSubmit: (data: RecipeFormData) => Promise<void>;
  onCancel?: () => void;
}

export function RecipeForm({ defaultValues, onSubmit, onCancel }: RecipeFormProps) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [name, setName] = useState(defaultValues?.name ?? "");
  const [servings, setServings] = useState(defaultValues?.servings ? String(defaultValues.servings) : "");
  const [instructions, setInstructions] = useState(defaultValues?.instructions ?? "");
  const [tags, setTags] = useState(defaultValues?.tags.join(", ") ?? "");
  const [rows, setRows] = useState<Row[]>(() =>
    defaultValues?.ingredients.length
      ? defaultValues.ingredients.map((i) => ({
          key: rowKey++,
          quantity: i.quantity !== undefined ? String(i.quantity) : "",
          unit: i.unit ?? "",
          name: i.name,
        }))
      : [blankRow(), blankRow(), blankRow()]
  );

  function updateRow(key: number, patch: Partial<Row>) {
    setRows((rs) => rs.map((r) => (r.key === key ? { ...r, ...patch } : r)));
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!name.trim()) return setError("Name is required");
    const s = parseOptionalNumber(servings);
    setError(null);
    setLoading(true);
    try {
      await onSubmit({
        name: name.trim(),
        servings: s ? Math.max(1, Math.round(s)) : undefined,
        ingredients: rows
          .filter((r) => r.name.trim())
          .map((r) => ({
            name: r.name.trim(),
            quantity: parseOptionalNumber(r.quantity),
            unit: r.unit.trim() || undefined,
          })),
        instructions,
        tags: [...new Set(tags.split(",").map((t) => t.trim()).filter(Boolean))],
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to save");
    } finally {
      setLoading(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <div className="grid gap-3 sm:grid-cols-[1fr_6rem]">
        <div className="space-y-1">
          <Label htmlFor="recipe-name">Name</Label>
          <Input
            id="recipe-name"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="e.g. Chicken burrito bowls"
            autoFocus
          />
        </div>
        <div className="space-y-1">
          <Label htmlFor="recipe-servings">Servings</Label>
          <Input
            id="recipe-servings"
            type="number"
            min={1}
            value={servings}
            onChange={(e) => setServings(e.target.value)}
          />
        </div>
      </div>

      <div className="space-y-2">
        <Label>Ingredients</Label>
        <div className="grid grid-cols-[4.5rem_5rem_1fr_2rem] gap-2 text-xs text-muted-foreground">
          <span>Qty</span>
          <span>Unit</span>
          <span>Item</span>
          <span />
        </div>
        <div className="max-h-[35vh] space-y-2 overflow-y-auto pr-1">
          {rows.map((r) => (
            <div key={r.key} className="grid grid-cols-[4.5rem_5rem_1fr_2rem] gap-2">
              <Input
                type="number"
                inputMode="decimal"
                min={0}
                step="any"
                value={r.quantity}
                onChange={(e) => updateRow(r.key, { quantity: e.target.value })}
                aria-label="Quantity"
              />
              <Input
                value={r.unit}
                onChange={(e) => updateRow(r.key, { unit: e.target.value })}
                placeholder="cup"
                aria-label="Unit"
              />
              <Input
                value={r.name}
                onChange={(e) => updateRow(r.key, { name: e.target.value })}
                placeholder="Ingredient"
                aria-label="Ingredient"
              />
              <Button
                type="button"
                variant="ghost"
                size="icon"
                onClick={() => setRows((rs) => rs.filter((x) => x.key !== r.key))}
                aria-label="Remove ingredient"
              >
                <Trash2 className="h-4 w-4" />
              </Button>
            </div>
          ))}
        </div>
        <Button type="button" variant="outline" size="sm" onClick={() => setRows((rs) => [...rs, blankRow()])}>
          <Plus className="mr-1 h-4 w-4" />
          Add ingredient
        </Button>
      </div>

      <div className="space-y-1">
        <Label htmlFor="recipe-instructions">Instructions</Label>
        <Textarea
          id="recipe-instructions"
          value={instructions}
          onChange={(e) => setInstructions(e.target.value)}
          placeholder={"1. Cook the rice\n2. Season and grill the chicken\n\nMarkdown supported"}
          rows={6}
        />
      </div>

      <div className="space-y-1">
        <Label htmlFor="recipe-tags">Tags</Label>
        <Input
          id="recipe-tags"
          value={tags}
          onChange={(e) => setTags(e.target.value)}
          placeholder="dinner, high-protein, meal-prep"
        />
      </div>

      {error && <p className="text-sm text-destructive">{error}</p>}

      <div className="flex justify-end gap-2">
        {onCancel && (
          <Button type="button" variant="outline" onClick={onCancel} disabled={loading}>
            Cancel
          </Button>
        )}
        <Button type="submit" disabled={loading}>
          {loading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
          {defaultValues ? "Save" : "Create recipe"}
        </Button>
      </div>
    </form>
  );
}
