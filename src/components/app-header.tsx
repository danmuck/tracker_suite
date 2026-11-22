"use client";

import { usePathname } from "next/navigation";
import { DataSourceSwitch } from "@/components/data-source-switch";

const segmentLabels: Record<string, string> = {
  finance: "Finance",
  accounts: "Accounts",
  transactions: "Transactions",
  projections: "Projections",
  reports: "Reports",
};

function buildBreadcrumb(pathname: string): string {
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
      <span className="font-medium text-sm">{label}</span>
      <div className="ml-auto flex items-center gap-1">
        <DataSourceSwitch />
      </div>
    </header>
  );
}
