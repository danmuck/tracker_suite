"use client";

import useSWR from "swr";
import { fetcher, send } from "@/hooks/request";
import type { Tour, TourFormData } from "@/types/future/apartments";

export const TOURS_KEY = "/api/future/tours";

export function useTours() {
  const { data, error, isLoading, mutate } = useSWR<Tour[]>(TOURS_KEY, fetcher);
  return { tours: data ?? [], isLoading, isError: !!error, mutate };
}

export const createTour = (data: TourFormData) => send<Tour>(TOURS_KEY, "POST", data);
export const updateTour = (id: string, data: TourFormData) => send<Tour>(`${TOURS_KEY}/${id}`, "PUT", data);
export const deleteTour = (id: string) => send(`${TOURS_KEY}/${id}`, "DELETE");
