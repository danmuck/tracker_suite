"use client";

import { useState } from "react";
import { usePathname } from "next/navigation";
import { SidebarProvider } from "@/components/ui/sidebar";
import { AppSidebar } from "@/components/app-sidebar";
import { SiteHeader } from "@/components/site/site-header";
import { isAppPath } from "@/lib/modules";

/**
 * The frame around every page: the nav bar on top, the sidebar under it, the page beside it.
 * The sidebar is collapsed on the landing page and expanded in the app; the toggle in the
 * nav bar overrides that until the next move between the two.
 */
export function AppShell({ children }: { children: React.ReactNode }) {
  const inApp = isAppPath(usePathname());
  const [open, setOpen] = useState(inApp);
  const [wasInApp, setWasInApp] = useState(inApp);
  if (wasInApp !== inApp) {
    setWasInApp(inApp);
    setOpen(inApp);
  }

  return (
    <SidebarProvider open={open} onOpenChange={setOpen} className="flex-col">
      <SiteHeader />
      <div className="flex min-h-0 flex-1">
        <AppSidebar />
        <div className="flex min-w-0 flex-1 flex-col">{children}</div>
      </div>
    </SidebarProvider>
  );
}
