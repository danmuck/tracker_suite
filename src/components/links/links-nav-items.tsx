"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Link2 } from "lucide-react";
import {
  SidebarMenuSub,
  SidebarMenuSubButton,
  SidebarMenuSubItem,
} from "@/components/ui/sidebar";
import { useLinkGroups } from "@/hooks/links/use-link-groups";
import { getIcon } from "@/lib/icon-map";

export function LinksNavItems() {
  const pathname = usePathname();
  const { groups } = useLinkGroups();

  return (
    <SidebarMenuSub>
      <SidebarMenuSubItem>
        <SidebarMenuSubButton asChild isActive={pathname === "/links"}>
          <Link href="/links">
            <Link2 className="h-4 w-4" />
            <span>All Groups</span>
          </Link>
        </SidebarMenuSubButton>
      </SidebarMenuSubItem>
      {groups.map((group) => {
        const Icon = group.icon ? getIcon(group.icon) : Link2;
        const isActive = pathname === `/links/${group.slug}`;
        return (
          <SidebarMenuSubItem key={group._id}>
            <SidebarMenuSubButton asChild isActive={isActive}>
              <Link href={`/links/${group.slug}`}>
                <Icon className="h-4 w-4" />
                <span>{group.name}</span>
              </Link>
            </SidebarMenuSubButton>
          </SidebarMenuSubItem>
        );
      })}
    </SidebarMenuSub>
  );
}
