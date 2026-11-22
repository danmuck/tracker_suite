"use client";

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
import { ThemeToggle } from "@/components/theme-toggle";
import { Wordmark } from "@/components/brand/wordmark";
import { LinksNavItems } from "@/components/links/links-nav-items";
import { availableModules, globalNavItems } from "@/lib/modules";
import { useResolvedDataSource } from "@/lib/data/mode";

export function AppSidebar() {
  const pathname = usePathname();
  const source = useResolvedDataSource();

  return (
    <Sidebar collapsible="icon">
      <SidebarHeader className="h-14 justify-center border-b px-4 group-data-[collapsible=icon]:px-0">
        <Link
          href="/"
          aria-label="dan muck, home"
          className="flex items-center group-data-[collapsible=icon]:justify-center"
        >
          <Wordmark className="text-xl group-data-[collapsible=icon]:hidden" />
          <Wordmark variant="mark" className="hidden text-base group-data-[collapsible=icon]:inline" />
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

        <SidebarSeparator />

        {/* Module groups */}
        {(source === null ? [] : availableModules(source)).map((mod) => {
          const isModuleActive = pathname.startsWith(mod.basePath);

          return (
            <Collapsible
              key={mod.id}
              defaultOpen={isModuleActive}
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
