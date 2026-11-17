"use client";

import { useEffect } from "react";
import { usePathname } from "next/navigation";
import { Database } from "lucide-react";
import { EmptyState } from "@/components/empty-state";
import { ensureDemoSeed } from "@/lib/demo";
import { getBrowserStorage, getBrowserStore } from "@/lib/data/local";
import { IS_DEMO, useResolvedDataSource } from "@/lib/data/mode";
import { modules } from "@/lib/modules";

// Shared across effect runs so React's double effect call cannot seed twice.
let demoSeed: Promise<boolean> | null = null;

export function ModuleGate({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const source = useResolvedDataSource();

  useEffect(() => {
    if (!IS_DEMO) return;
    const store = getBrowserStore();
    demoSeed ??= ensureDemoSeed(store, getBrowserStorage());
    demoSeed
      .then((seeded) => {
        if (seeded) window.location.reload();
      })
      .catch((error) => console.error(error));
  }, []);

  if (source === null) return null;

  const current = modules.find(
    (m) => pathname === m.basePath || pathname.startsWith(`${m.basePath}/`)
  );
  if (source === "browser" && current && !current.browserData) {
    return (
      <EmptyState
        icon={Database}
        title="Not available in browser data mode"
        description="This module only works with My data for now."
      />
    );
  }
  return <>{children}</>;
}
