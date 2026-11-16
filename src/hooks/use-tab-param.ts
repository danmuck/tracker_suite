"use client";

import { useCallback } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";

/** Keep the active tab in ?tab= so it survives reloads and can be linked to */
export function useTabParam<T extends string>(tabs: readonly T[], fallback: T) {
  const searchParams = useSearchParams();
  const router = useRouter();
  const pathname = usePathname();
  const raw = searchParams.get("tab");
  const tab = (tabs as readonly string[]).includes(raw ?? "") ? (raw as T) : fallback;

  const setTab = useCallback(
    (next: string) => {
      const params = new URLSearchParams(searchParams.toString());
      params.set("tab", next);
      router.replace(`${pathname}?${params}`, { scroll: false });
    },
    [pathname, router, searchParams]
  );

  return [tab, setTab] as const;
}
