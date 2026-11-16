"use client";

import useSWR from "swr";
import { fetcher, send } from "@/hooks/request";
import type { Listing, ListingFormData, ListingStatus } from "@/types/future/apartments";

export const LISTINGS_KEY = "/api/future/listings";

export function useListings() {
  const { data, error, isLoading, mutate } = useSWR<Listing[]>(LISTINGS_KEY, fetcher);
  return { listings: data ?? [], isLoading, isError: !!error, mutate };
}

export const createListing = (data: ListingFormData) => send<Listing>(LISTINGS_KEY, "POST", data);
export const updateListing = (id: string, data: ListingFormData) =>
  send<Listing>(`${LISTINGS_KEY}/${id}`, "PUT", data);
export const setListingStatus = (id: string, status: ListingStatus) =>
  send<Listing>(`${LISTINGS_KEY}/${id}`, "PATCH", { status });
export const deleteListing = (id: string) => send(`${LISTINGS_KEY}/${id}`, "DELETE");
