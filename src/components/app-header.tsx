"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { SidebarTrigger } from "@/components/ui/sidebar";
import { Separator } from "@/components/ui/separator";
import { ThemeToggle } from "@/components/theme-toggle";
import { findModule, findNavItem } from "@/config/modules";

export function AppHeader() {
  const pathname = usePathname();
  const suiteModule = findModule(pathname);
  const page = findNavItem(pathname);
  const onOverview = !page || page.href === suiteModule?.basePath;

  return (
    <header className="flex h-14 items-center gap-2 border-b px-4">
      <SidebarTrigger className="-ml-1" />
      <Separator orientation="vertical" className="h-5" />
      <nav aria-label="Breadcrumb" className="flex items-center gap-2 text-sm">
        {suiteModule &&
          (onOverview ? (
            <span className="font-medium">{suiteModule.name}</span>
          ) : (
            <>
              <Link
                href={suiteModule.basePath}
                className="text-muted-foreground transition-colors hover:text-foreground"
              >
                {suiteModule.name}
              </Link>
              <span aria-hidden className="text-muted-foreground/50">
                /
              </span>
              <span className="font-medium">{page.label}</span>
            </>
          ))}
      </nav>
      <div className="ml-auto">
        <ThemeToggle />
      </div>
    </header>
  );
}
