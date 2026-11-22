"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Home } from "lucide-react";
import {
  Sidebar,
  SidebarContent,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarRail,
} from "@/components/ui/sidebar";
import { Wordmark } from "@/components/brand/wordmark";
import { findNavItem, modules } from "@/config/modules";

export function AppSidebar() {
  const pathname = usePathname();
  const activeHref = findNavItem(pathname)?.href;

  return (
    <Sidebar collapsible="icon">
      <SidebarHeader className="h-14 justify-center border-b px-4 group-data-[collapsible=icon]:px-0">
        <Link
          href="/"
          aria-label="dan muck, home"
          className="flex items-center group-data-[collapsible=icon]:justify-center"
        >
          <Wordmark className="text-xl group-data-[collapsible=icon]:hidden" />
          <Wordmark
            variant="mark"
            className="hidden text-base group-data-[collapsible=icon]:inline"
          />
        </Link>
      </SidebarHeader>

      <SidebarContent>
        <SidebarGroup>
          <SidebarGroupContent>
            <SidebarMenu>
              <SidebarMenuItem>
                <SidebarMenuButton asChild tooltip="Home">
                  <Link href="/">
                    <Home className="h-4 w-4" />
                    <span>Home</span>
                  </Link>
                </SidebarMenuButton>
              </SidebarMenuItem>
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>

        {modules.map((module) => (
          <SidebarGroup key={module.id}>
            <SidebarGroupLabel className="font-mono text-[11px] uppercase tracking-widest">
              {module.name}
            </SidebarGroupLabel>
            <SidebarGroupContent>
              <SidebarMenu>
                {module.nav.map(({ href, label, icon: Icon }) => (
                  <SidebarMenuItem key={href}>
                    <SidebarMenuButton asChild isActive={href === activeHref} tooltip={label}>
                      <Link href={href}>
                        <Icon className="h-4 w-4" />
                        <span>{label}</span>
                      </Link>
                    </SidebarMenuButton>
                  </SidebarMenuItem>
                ))}
              </SidebarMenu>
            </SidebarGroupContent>
          </SidebarGroup>
        ))}
      </SidebarContent>

      <SidebarRail />
    </Sidebar>
  );
}
