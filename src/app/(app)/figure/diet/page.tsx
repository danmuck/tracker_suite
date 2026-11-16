"use client";

import { Suspense, useMemo, useState } from "react";
import { BookOpen, Plus } from "lucide-react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { PageHeader } from "@/components/page-header";
import { LoadingState } from "@/components/loading-state";
import { EmptyState } from "@/components/empty-state";
import { DeleteConfirmDialog } from "@/components/delete-confirm-dialog";
import { RecipeCard } from "@/components/figure/recipe-card";
import { RecipeDetail } from "@/components/figure/recipe-detail";
import { RecipeForm } from "@/components/figure/recipe-form";
import { ShoppingList } from "@/components/figure/shopping-list";
import { useTabParam } from "@/hooks/use-tab-param";
import { addRecipeToList, createRecipe, deleteRecipe, updateRecipe, useRecipes } from "@/hooks/figure/use-recipes";
import { SHOPPING_ITEMS_KEY, useShoppingItems } from "@/hooks/figure/use-shopping-items";
import { useSWRConfig } from "swr";
import type { Recipe, RecipeFormData } from "@/types/figure/diet";

const TABS = ["recipes", "shopping"] as const;

export default function DietPage() {
  return (
    <Suspense fallback={<LoadingState variant="cards" />}>
      <DietContent />
    </Suspense>
  );
}

function DietContent() {
  const [tab, setTab] = useTabParam(TABS, "recipes");
  const { recipes, isLoading, mutate: mutateRecipes } = useRecipes();
  const { items } = useShoppingItems();
  const { mutate } = useSWRConfig();

  const [search, setSearch] = useState("");
  const [tagFilter, setTagFilter] = useState<string | null>(null);
  const [viewing, setViewing] = useState<Recipe | null>(null);
  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState<Recipe | null>(null);
  const [deleting, setDeleting] = useState<Recipe | null>(null);

  const allTags = useMemo(
    () => [...new Set(recipes.flatMap((r) => r.tags))].sort((a, b) => a.localeCompare(b)),
    [recipes]
  );
  const filtered = recipes.filter(
    (r) =>
      (!tagFilter || r.tags.includes(tagFilter)) &&
      (!search.trim() || r.name.toLowerCase().includes(search.trim().toLowerCase()))
  );
  const openItems = items.filter((i) => !i.checked).length;

  async function save(data: RecipeFormData) {
    if (editing) {
      const updated = await updateRecipe(editing._id, data);
      setEditing(null);
      if (viewing?._id === editing._id) setViewing(updated);
    } else {
      await createRecipe(data);
      setFormOpen(false);
    }
    mutateRecipes();
    mutate(SHOPPING_ITEMS_KEY);
  }

  async function handleDelete() {
    if (!deleting) return;
    await deleteRecipe(deleting._id);
    setViewing(null);
    mutateRecipes();
    mutate(SHOPPING_ITEMS_KEY);
  }

  async function addToList(r: Recipe) {
    try {
      const { added, merged } = await addRecipeToList(r._id);
      const parts = [added && `${added} added`, merged && `${merged} merged with existing`].filter(Boolean);
      toast.success(`${r.name}: ${parts.join(", ") || "nothing to add"}`, {
        action: { label: "View list", onClick: () => setTab("shopping") },
      });
      mutate(SHOPPING_ITEMS_KEY);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to add to list");
    }
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title="Diet"
        description="Recipes and your shopping list"
        action={
          tab === "recipes" ? (
            <Button onClick={() => setFormOpen(true)}>
              <Plus className="mr-2 h-4 w-4" />
              New recipe
            </Button>
          ) : undefined
        }
      />

      <Tabs value={tab} onValueChange={setTab} className="gap-6">
        <TabsList variant="line" className="w-full justify-start border-b">
          <TabsTrigger value="recipes" className="flex-none">
            Recipes ({recipes.length})
          </TabsTrigger>
          <TabsTrigger value="shopping" className="flex-none">
            Shopping List{openItems > 0 ? ` (${openItems})` : ""}
          </TabsTrigger>
        </TabsList>

        <TabsContent value="recipes" className="space-y-4">
          {isLoading ? (
            <LoadingState variant="cards" />
          ) : recipes.length === 0 ? (
            <EmptyState
              icon={BookOpen}
              title="No recipes yet"
              description="Save a recipe with its ingredients, then send them to your shopping list in one click."
              action={{ label: "New recipe", onClick: () => setFormOpen(true) }}
            />
          ) : (
            <>
              <div className="flex flex-wrap items-center gap-2">
                <Input
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  placeholder="Search recipes…"
                  className="w-full sm:w-64"
                />
                {allTags.map((t) => (
                  <Badge
                    key={t}
                    asChild
                    variant={tagFilter === t ? "default" : "outline"}
                    className="cursor-pointer"
                  >
                    <button type="button" onClick={() => setTagFilter(tagFilter === t ? null : t)}>
                      {t}
                    </button>
                  </Badge>
                ))}
              </div>
              {filtered.length === 0 ? (
                <p className="py-8 text-center text-sm text-muted-foreground">No recipes match.</p>
              ) : (
                <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                  {filtered.map((r) => (
                    <RecipeCard key={r._id} recipe={r} onOpen={setViewing} />
                  ))}
                </div>
              )}
            </>
          )}
        </TabsContent>

        <TabsContent value="shopping">
          <ShoppingList />
        </TabsContent>
      </Tabs>

      {/* Recipe detail */}
      <Dialog open={!!viewing && !editing} onOpenChange={(o) => !o && setViewing(null)}>
        <DialogContent className="sm:max-w-xl">
          <DialogHeader>
            <DialogTitle>{viewing?.name}</DialogTitle>
          </DialogHeader>
          {viewing && (
            <RecipeDetail recipe={viewing} onAddToList={addToList} onEdit={setEditing} onDelete={setDeleting} />
          )}
        </DialogContent>
      </Dialog>

      {/* Create / edit */}
      <Dialog
        open={formOpen || !!editing}
        onOpenChange={(o) => {
          if (!o) {
            setFormOpen(false);
            setEditing(null);
          }
        }}
      >
        <DialogContent className="sm:max-w-2xl">
          <DialogHeader>
            <DialogTitle>{editing ? "Edit recipe" : "New recipe"}</DialogTitle>
          </DialogHeader>
          <RecipeForm
            key={editing?._id ?? "new"}
            defaultValues={editing ?? undefined}
            onSubmit={save}
            onCancel={() => {
              setFormOpen(false);
              setEditing(null);
            }}
          />
        </DialogContent>
      </Dialog>

      <DeleteConfirmDialog
        open={!!deleting}
        onOpenChange={(o) => !o && setDeleting(null)}
        onConfirm={handleDelete}
        title="Delete recipe"
        description="Items already on your shopping list stay there. This action cannot be undone."
      />
    </div>
  );
}
