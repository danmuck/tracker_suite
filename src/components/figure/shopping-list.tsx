"use client";

import { useState } from "react";
import { Loader2, Plus, ShoppingCart, X } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { EmptyState } from "@/components/empty-state";
import { LoadingState } from "@/components/loading-state";
import {
  clearCheckedShoppingItems,
  createShoppingItem,
  deleteShoppingItem,
  updateShoppingItem,
  useShoppingItems,
} from "@/hooks/figure/use-shopping-items";
import { formatQuantity, parseOptionalNumber } from "@/lib/figure/format";
import { cn } from "@/lib/utils";
import type { ShoppingItem } from "@/types/figure/diet";

export function ShoppingList() {
  const { items, isLoading, mutate } = useShoppingItems();
  const [name, setName] = useState("");
  const [quantity, setQuantity] = useState("");
  const [unit, setUnit] = useState("");
  const [adding, setAdding] = useState(false);

  const unchecked = items.filter((i) => !i.checked);
  const checked = items.filter((i) => i.checked);

  async function add(e: React.FormEvent) {
    e.preventDefault();
    if (!name.trim()) return;
    setAdding(true);
    try {
      await createShoppingItem({
        name: name.trim(),
        quantity: parseOptionalNumber(quantity),
        unit: unit.trim() || undefined,
      });
      setName("");
      setQuantity("");
      setUnit("");
      mutate();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to add item");
    } finally {
      setAdding(false);
    }
  }

  async function toggle(item: ShoppingItem, value: boolean) {
    // Optimistic: flip locally, then sync
    mutate(
      items.map((i) => (i._id === item._id ? { ...i, checked: value } : i)),
      { revalidate: false }
    );
    try {
      await updateShoppingItem(item._id, { checked: value });
    } catch {
      toast.error("Failed to update item");
    } finally {
      mutate();
    }
  }

  async function remove(item: ShoppingItem) {
    mutate(items.filter((i) => i._id !== item._id), { revalidate: false });
    try {
      await deleteShoppingItem(item._id);
    } catch {
      toast.error("Failed to remove item");
    } finally {
      mutate();
    }
  }

  async function clearChecked() {
    const { deleted } = await clearCheckedShoppingItems();
    toast.success(`Cleared ${deleted} item${deleted !== 1 ? "s" : ""}`);
    mutate();
  }

  return (
    <div className="max-w-2xl space-y-4">
      <form onSubmit={add} className="grid grid-cols-[1fr_4.5rem_5rem_auto] gap-2">
        <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="Add an item…" aria-label="Item" />
        <Input
          type="number"
          inputMode="decimal"
          min={0}
          step="any"
          value={quantity}
          onChange={(e) => setQuantity(e.target.value)}
          placeholder="Qty"
          aria-label="Quantity"
        />
        <Input value={unit} onChange={(e) => setUnit(e.target.value)} placeholder="Unit" aria-label="Unit" />
        <Button type="submit" disabled={adding || !name.trim()} aria-label="Add item">
          {adding ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />}
        </Button>
      </form>

      {isLoading ? (
        <LoadingState variant="table" />
      ) : items.length === 0 ? (
        <EmptyState
          icon={ShoppingCart}
          title="Your list is empty"
          description="Add items above, or open a recipe and choose “Add to shopping list”."
        />
      ) : (
        <>
          <ItemList items={unchecked} onToggle={toggle} onRemove={remove} />
          {checked.length > 0 && (
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <h3 className="text-sm font-medium text-muted-foreground">In the cart ({checked.length})</h3>
                <Button variant="ghost" size="sm" onClick={clearChecked}>
                  Clear checked
                </Button>
              </div>
              <ItemList items={checked} onToggle={toggle} onRemove={remove} />
            </div>
          )}
        </>
      )}
    </div>
  );
}

function ItemList({
  items,
  onToggle,
  onRemove,
}: {
  items: ShoppingItem[];
  onToggle: (i: ShoppingItem, v: boolean) => void;
  onRemove: (i: ShoppingItem) => void;
}) {
  if (items.length === 0) return null;
  return (
    <ul className="divide-y rounded-lg border">
      {items.map((item) => {
        const qty = formatQuantity(item.quantity, item.unit);
        return (
          <li key={item._id} className="group flex items-center gap-3 px-3 py-2">
            <Checkbox
              id={`item-${item._id}`}
              checked={item.checked}
              onCheckedChange={(v) => onToggle(item, v === true)}
            />
            <label
              htmlFor={`item-${item._id}`}
              className={cn("flex flex-1 cursor-pointer flex-wrap items-baseline gap-x-2", item.checked && "text-muted-foreground line-through")}
            >
              <span>{item.name}</span>
              {qty && <span className="text-sm tabular-nums text-muted-foreground">{qty}</span>}
              {item.recipeName && (
                <span className="text-xs text-muted-foreground no-underline">· {item.recipeName}</span>
              )}
            </label>
            <Button
              variant="ghost"
              size="icon"
              className="h-7 w-7 opacity-60 group-hover:opacity-100"
              onClick={() => onRemove(item)}
              aria-label={`Remove ${item.name}`}
            >
              <X className="h-4 w-4" />
            </Button>
          </li>
        );
      })}
    </ul>
  );
}
