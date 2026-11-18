"use client";

import useSWR from "swr";
import { fetcher, send } from "@/hooks/request";
import { NO_RETRY_ON_STATUS } from "@/hooks/swr-options";
import type { ShoppingItem, ShoppingItemFormData } from "@/types/figure/diet";

export const SHOPPING_ITEMS_KEY = "/api/figure/shopping-items";

export function useShoppingItems() {
  const { data, error, isLoading, mutate } = useSWR<ShoppingItem[]>(SHOPPING_ITEMS_KEY, fetcher, NO_RETRY_ON_STATUS);
  return {
    items: data ?? [],
    // SWR keeps the last list when a background refresh fails: isError can be true with data to show
    hasData: data !== undefined,
    isLoading,
    isError: !!error,
    mutate,
  };
}

export const createShoppingItem = (data: ShoppingItemFormData) =>
  send<ShoppingItem>(SHOPPING_ITEMS_KEY, "POST", data);

export const updateShoppingItem = (id: string, data: Partial<ShoppingItemFormData>) =>
  send<ShoppingItem>(`${SHOPPING_ITEMS_KEY}/${id}`, "PUT", data);

export const deleteShoppingItem = (id: string) => send(`${SHOPPING_ITEMS_KEY}/${id}`, "DELETE");

export const clearCheckedShoppingItems = () =>
  send<{ deleted: number }>(`${SHOPPING_ITEMS_KEY}/clear-checked`, "POST");
