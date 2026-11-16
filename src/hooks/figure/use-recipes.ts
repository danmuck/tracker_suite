"use client";

import useSWR from "swr";
import { fetcher, send } from "./request";
import type { Recipe, RecipeFormData } from "@/types/figure/diet";

export function useRecipes() {
  const { data, error, isLoading, mutate } = useSWR<Recipe[]>("/api/figure/recipes", fetcher);
  return { recipes: data ?? [], isLoading, isError: !!error, mutate };
}

export const createRecipe = (data: RecipeFormData) =>
  send<Recipe>("/api/figure/recipes", "POST", data);

export const updateRecipe = (id: string, data: RecipeFormData) =>
  send<Recipe>(`/api/figure/recipes/${id}`, "PUT", data);

export const deleteRecipe = (id: string) => send(`/api/figure/recipes/${id}`, "DELETE");

export const addRecipeToList = (id: string) =>
  send<{ added: number; merged: number }>(`/api/figure/recipes/${id}/add-to-list`, "POST");
