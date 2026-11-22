"use client";

import { useLayoutEffect } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { ChevronRight } from "lucide-react";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupLabel,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarMenuSub,
  SidebarMenuSubButton,
  SidebarMenuSubItem,
  SidebarRail,
  SidebarSeparator,
} from "@/components/ui/sidebar";
import { Logo } from "@/components/brand/logo";
import { ThemeToggle } from "@/components/theme-toggle";
import { LinksNavItems } from "@/components/links/links-nav-items";
import { availableModules, globalNavItems } from "@/lib/modules";
import { useResolvedDataSource } from "@/lib/data/mode";
import { setSectionOpen, useOpenSections } from "@/hooks/use-open-sections";

export function AppSidebar() {
  const pathname = usePathname();
  const source = useResolvedDataSource();
  const openSections = useOpenSections();
  const visibleModules = source === null ? [] : availableModules(source);
  const activeModuleId = visibleModules.find((mod) => pathname.startsWith(mod.basePath))?.id;

  // Opening a module expands its section; it then stays open until collapsed by hand
  useLayoutEffect(() => {
    if (activeModuleId) setSectionOpen(activeModuleId, true);
  }, [activeModuleId, pathname]);

  return (
    <Sidebar collapsible="icon">
      <SidebarHeader className="p-4 group-data-[collapsible=icon]:px-0">
        <Link
          href="/"
          aria-label="Home"
          className="flex h-8 items-center group-data-[collapsible=icon]:justify-center"
        >
          <Logo />
        </Link>
      </SidebarHeader>

      <SidebarContent>
        {/* Global nav */}
        <SidebarGroup>
          <SidebarMenu>
            {globalNavItems.map(({ href, label, icon: Icon }) => {
              const isActive = pathname === href;
              return (
                <SidebarMenuItem key={href}>
                  <SidebarMenuButton asChild isActive={isActive} tooltip={label}>
                    <Link href={href}>
                      <Icon className="h-4 w-4" />
                      <span>{label}</span>
                    </Link>
                  </SidebarMenuButton>
                </SidebarMenuItem>
              );
            })}
          </SidebarMenu>
        </SidebarGroup>

        <SidebarSeparator className="bg-brand" />

        {/* Module groups */}
        {visibleModules.map((mod) => {
          return (
            <Collapsible
              key={mod.id}
              open={openSections.includes(mod.id)}
              onOpenChange={(open) => setSectionOpen(mod.id, open)}
              className="group/collapsible"
            >
              <SidebarGroup>
                <SidebarGroupLabel asChild>
                  <CollapsibleTrigger className="flex w-full items-center gap-2 [&[data-state=open]>svg.chevron]:rotate-90">
                    <mod.icon className="h-4 w-4" />
                    <span className="flex-1 text-left">{mod.label}</span>
                    <ChevronRight className="chevron h-4 w-4 shrink-0 transition-transform duration-200" />
                  </CollapsibleTrigger>
                </SidebarGroupLabel>
                <CollapsibleContent>
                  <SidebarMenu>
                    {mod.id === "links" ? (
                      <LinksNavItems />
                    ) : (
                      <SidebarMenuSub>
                        {mod.navItems.map(({ href, label, icon: Icon }) => {
                          const isActive =
                            href === mod.basePath
                              ? pathname === mod.basePath
                              : pathname.startsWith(href);
                          return (
                            <SidebarMenuSubItem key={href}>
                              <SidebarMenuSubButton asChild isActive={isActive}>
                                <Link href={href}>
                                  <Icon className="h-4 w-4" />
                                  <span>{label}</span>
                                </Link>
                              </SidebarMenuSubButton>
                            </SidebarMenuSubItem>
                          );
                        })}
                      </SidebarMenuSub>
                    )}
                  </SidebarMenu>
                </CollapsibleContent>
              </SidebarGroup>
            </Collapsible>
          );
        })}
      </SidebarContent>

      <SidebarFooter className="p-2">
        <div className="flex items-center justify-center group-data-[collapsible=icon]:justify-center">
          <ThemeToggle />
        </div>
      </SidebarFooter>

      <SidebarRail />
    </Sidebar>
  );
}
