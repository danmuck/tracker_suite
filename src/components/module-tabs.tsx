"use client";

import { usePathname } from "next/navigation";
import { LinksTabs } from "@/components/links/links-tabs";
import { TabNav } from "@/components/tab-nav";
import { useResolvedDataSource } from "@/lib/data/mode";
import { availableModules, isNavItemActive, moduleForPath } from "@/lib/modules";

/** The current module's sections as tabs above its pages. A module with one section shows none */
export function ModuleTabs() {
  const pathname = usePathname();
  const source = useResolvedDataSource();
  const mod = moduleForPath(pathname);
  if (!mod || source === null || !availableModules(source).includes(mod)) return null;

  // Links has one tab per group, which only the store knows
  if (mod.id === "links") return <LinksTabs accentColor={mod.accentColor} />;
  if (mod.navItems.length < 2) return null;

  return (
    <TabNav
      label={`${mod.label} sections`}
      accentColor={mod.accentColor}
      items={mod.navItems.map((item) => ({
        href: item.href,
        label: item.label,
        icon: item.icon,
        active: isNavItemActive(mod, item, pathname),
      }))}
    />
  );
}
