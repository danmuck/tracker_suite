"use client";

import { Suspense } from "react";
import { usePathname, useSearchParams } from "next/navigation";
import { Link2 } from "lucide-react";
import { TabNav } from "@/components/tab-nav";
import { useLinkGroups } from "@/hooks/links/use-link-groups";
import { getIcon } from "@/lib/icon-map";
import { linkGroupHref } from "@/lib/links/paths";

/** The Links module's tabs: every group, after a tab for the page that lists them all */
export function LinksTabs({ accentColor }: { accentColor: string }) {
  // useSearchParams needs a Suspense boundary for the static build; until it resolves, no group is active.
  return (
    <Suspense fallback={<GroupTabs activeSlug={null} accentColor={accentColor} />}>
      <GroupTabsWithParams accentColor={accentColor} />
    </Suspense>
  );
}

function GroupTabsWithParams({ accentColor }: { accentColor: string }) {
  const pathname = usePathname();
  const slug = useSearchParams().get("slug");
  return <GroupTabs activeSlug={pathname === "/links/group" ? slug : null} accentColor={accentColor} />;
}

function GroupTabs({ activeSlug, accentColor }: { activeSlug: string | null; accentColor: string }) {
  const pathname = usePathname();
  const { groups } = useLinkGroups();
  if (groups.length === 0) return null;

  return (
    <TabNav
      label="Link groups"
      accentColor={accentColor}
      items={[
        { href: "/links", label: "All Groups", icon: Link2, active: pathname === "/links" },
        ...groups.map((group) => ({
          href: linkGroupHref(group.slug),
          label: group.name,
          icon: group.icon ? getIcon(group.icon) : Link2,
          active: activeSlug === group.slug,
        })),
      ]}
    />
  );
}
