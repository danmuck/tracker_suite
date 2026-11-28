"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  Sidebar,
  SidebarContent,
  SidebarGroup,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarRail,
  SidebarSeparator,
} from "@/components/ui/sidebar";
import { availableModules, globalNavItems, moduleForPath, moduleHome } from "@/lib/modules";
import { useResolvedDataSource } from "@/lib/data/mode";

/** One link per module. A module's sections are tabs on its own pages (ModuleTabs) */
export function AppSidebar() {
  const pathname = usePathname();
  const source = useResolvedDataSource();
  const visibleModules = source === null ? [] : availableModules(source);
  const activeModuleId = moduleForPath(pathname)?.id;

  return (
    <Sidebar collapsible="icon" className="top-14 h-[calc(100svh-3.5rem)]">
      <SidebarContent>
        {/* Global nav */}
        <SidebarGroup>
          <SidebarMenu>
            {globalNavItems.map(({ href, label, icon: Icon }) => (
              <SidebarMenuItem key={href}>
                <SidebarMenuButton asChild isActive={pathname === href} tooltip={label}>
                  <Link href={href}>
                    <Icon className="h-4 w-4" />
                    <span>{label}</span>
                  </Link>
                </SidebarMenuButton>
              </SidebarMenuItem>
            ))}
          </SidebarMenu>
        </SidebarGroup>

        <SidebarSeparator className="bg-brand" />

        {/* Modules */}
        <SidebarGroup>
          <SidebarMenu>
            {visibleModules.map((mod) => (
              <SidebarMenuItem key={mod.id}>
                <SidebarMenuButton asChild isActive={mod.id === activeModuleId} tooltip={mod.label}>
                  <Link href={moduleHome(mod)}>
                    <mod.icon className="h-4 w-4" />
                    <span>{mod.label}</span>
                  </Link>
                </SidebarMenuButton>
              </SidebarMenuItem>
            ))}
          </SidebarMenu>
        </SidebarGroup>
      </SidebarContent>

      <SidebarRail />
    </Sidebar>
  );
}
