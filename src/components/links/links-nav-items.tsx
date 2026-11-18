"use client";

import { Suspense } from "react";
import Link from "next/link";
import { usePathname, useSearchParams } from "next/navigation";
import { Link2 } from "lucide-react";
import {
  SidebarMenuSub,
  SidebarMenuSubButton,
  SidebarMenuSubItem,
} from "@/components/ui/sidebar";
import { useLinkGroups } from "@/hooks/links/use-link-groups";
import { getIcon } from "@/lib/icon-map";
import { linkGroupHref } from "@/lib/links/paths";

export function LinksNavItems() {
  // useSearchParams needs a Suspense boundary for the static build; until it resolves, no group is active.
  return (
    <Suspense fallback={<NavList activeSlug={null} />}>
      <NavListWithParams />
    </Suspense>
  );
}

function NavListWithParams() {
  const pathname = usePathname();
  const slug = useSearchParams().get("slug");
  return <NavList activeSlug={pathname === "/links/group" ? slug : null} />;
}

function NavList({ activeSlug }: { activeSlug: string | null }) {
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
        return (
          <SidebarMenuSubItem key={group._id}>
            <SidebarMenuSubButton asChild isActive={activeSlug === group.slug}>
              <Link href={linkGroupHref(group.slug)}>
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
