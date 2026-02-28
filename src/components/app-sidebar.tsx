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
import { modules, globalNavItems } from "@/lib/modules";

export function AppSidebar() {
  const pathname = usePathname();

  return (
    <Sidebar collapsible="icon">
      <SidebarHeader className="p-4 group-data-[collapsible=icon]:px-0">
        <div className="flex items-center gap-2 group-data-[collapsible=icon]:justify-center">
          <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md bg-primary text-primary-foreground font-bold text-sm">
            TS
          </div>
          <span className="font-semibold text-lg group-data-[collapsible=icon]:hidden">
            Tracker Suite
          </span>
        </div>
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
        {modules.map((mod) => {
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
