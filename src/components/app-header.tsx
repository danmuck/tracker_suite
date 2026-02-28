"use client";

import { usePathname } from "next/navigation";
import { SidebarTrigger } from "@/components/ui/sidebar";
import { Separator } from "@/components/ui/separator";
import { ThemeToggle } from "@/components/theme-toggle";

const segmentLabels: Record<string, string> = {
  finance: "Finance",
  accounts: "Accounts",
  transactions: "Transactions",
  projections: "Projections",
  reports: "Reports",
};

function buildBreadcrumb(pathname: string): string {
  if (pathname === "/") return "Dashboard";

  const segments = pathname.split("/").filter(Boolean);
  return segments
    .map((seg) => segmentLabels[seg] ?? seg.charAt(0).toUpperCase() + seg.slice(1))
    .join(" / ");
}

export function AppHeader() {
  const pathname = usePathname();
  const label = buildBreadcrumb(pathname);

  return (
    <header className="flex h-14 items-center gap-2 border-b px-4">
      <SidebarTrigger className="-ml-1" />
      <Separator orientation="vertical" className="h-5" />
      <span className="font-medium text-sm">{label}</span>
      <div className="ml-auto">
        <ThemeToggle />
      </div>
    </header>
  );
}
