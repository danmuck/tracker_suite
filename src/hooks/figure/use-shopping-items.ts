"use client";

import useSWR from "swr";
import { fetcher, send } from "@/hooks/request";
import type { ShoppingItem, ShoppingItemFormData } from "@/types/figure/diet";

export const SHOPPING_ITEMS_KEY = "/api/figure/shopping-items";

export function useShoppingItems() {
  const { data, error, isLoading, mutate } = useSWR<ShoppingItem[]>(SHOPPING_ITEMS_KEY, fetcher);
  return { items: data ?? [], isLoading, isError: !!error, mutate };
}

export const createShoppingItem = (data: ShoppingItemFormData) =>
  send<ShoppingItem>(SHOPPING_ITEMS_KEY, "POST", data);

export const updateShoppingItem = (id: string, data: Partial<ShoppingItemFormData>) =>
  send<ShoppingItem>(`${SHOPPING_ITEMS_KEY}/${id}`, "PUT", data);

export const deleteShoppingItem = (id: string) => send(`${SHOPPING_ITEMS_KEY}/${id}`, "DELETE");

export const clearCheckedShoppingItems = () =>
  send<{ deleted: number }>(`${SHOPPING_ITEMS_KEY}/clear-checked`, "POST");
