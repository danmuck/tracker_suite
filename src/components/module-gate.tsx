"use client";

import { useEffect, useState } from "react";
import { usePathname } from "next/navigation";
import { toast } from "sonner";
import { Database } from "lucide-react";
import { EmptyState } from "@/components/empty-state";
import { ensureDemoSeed } from "@/lib/demo";
import { getBrowserStorage, getBrowserStore, isBrowserStoragePersistent } from "@/lib/data/local";
import { IS_DEMO, useResolvedDataSource } from "@/lib/data/mode";
import { shouldReloadAfterSeed } from "@/lib/data/storage";
import { modules } from "@/lib/modules";

// Shared across effect runs so React's double effect call cannot seed twice.
let demoSeed: Promise<boolean> | null = null;

export function ModuleGate({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const source = useResolvedDataSource();
  // In the demo nothing renders until the seed settles, so no request runs before the data exists.
  const [seedSettled, setSeedSettled] = useState(!IS_DEMO);

  useEffect(() => {
    if (!IS_DEMO) return;
    const store = getBrowserStore();
    demoSeed ??= ensureDemoSeed(store, getBrowserStorage());
    demoSeed
      .then((seeded) => {
        if (shouldReloadAfterSeed(seeded, isBrowserStoragePersistent())) window.location.reload();
        else setSeedSettled(true);
      })
      .catch((error) => {
        console.error(error);
        toast.error("Could not load sample data");
        setSeedSettled(true);
      });
  }, []);

  if (source === null || !seedSettled) return null;

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
