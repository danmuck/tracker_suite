import {
  Home,
  LayoutDashboard,
  Wallet,
  ArrowRightLeft,
  CalendarDays,
  TrendingUp,
  Calculator,
  DollarSign,
  FolderKanban,
  Link2,
  Dumbbell,
  Salad,
  Building2,
  Network,
  Ghost,
  Sprout,
  ListChecks,
  Activity,
  Route,
  PackagePlus,
  type LucideIcon,
} from "lucide-react";
import type { DataSource } from "@/lib/data/mode";

export interface NavItem {
  href: string;
  label: string;
  icon: LucideIcon;
  /** Pages that belong to this section without being under its path, such as a detail page */
  also?: string[];
}

export interface ModuleConfig {
  id: string;
  label: string;
  icon: LucideIcon;
  basePath: string;
  accentColor: string;
  /** The module's sections, shown as tabs above its pages */
  navItems: NavItem[];
  browserData: boolean; // works with browser-stored data
}

export const modules: ModuleConfig[] = [
  {
    id: "finance",
    label: "Finance",
    icon: DollarSign,
    basePath: "/finance",
    accentColor: "var(--chart-2)",
    navItems: [
      { href: "/finance", label: "Dashboard", icon: LayoutDashboard },
      { href: "/finance/calendar", label: "Calendar", icon: CalendarDays },
      { href: "/finance/accounts", label: "Accounts", icon: Wallet },
      { href: "/finance/transactions", label: "Transactions", icon: ArrowRightLeft },
      { href: "/finance/projections", label: "Projections", icon: TrendingUp },
      { href: "/finance/datasheet", label: "Datasheet", icon: Calculator },
    ],
    browserData: true,
  },
  {
    id: "figure",
    label: "Figure",
    icon: Dumbbell,
    basePath: "/figure",
    accentColor: "var(--chart-5)",
    navItems: [
      { href: "/figure/fitness", label: "Fitness", icon: Dumbbell },
      { href: "/figure/diet", label: "Diet", icon: Salad },
    ],
    browserData: true,
  },
  {
    id: "future",
    label: "Future",
    icon: Building2,
    basePath: "/future",
    accentColor: "var(--chart-1)",
    navItems: [
      { href: "/future/apartments", label: "Apartments", icon: Building2 },
    ],
    browserData: true,
  },
  {
    id: "projects",
    label: "Projects",
    icon: FolderKanban,
    basePath: "/projects",
    accentColor: "var(--chart-3)",
    navItems: [
      { href: "/projects", label: "Projects", icon: FolderKanban },
    ],
    browserData: true,
  },
  {
    id: "links",
    label: "Links",
    icon: Link2,
    basePath: "/links",
    accentColor: "var(--chart-4)",
    navItems: [],
    browserData: true,
  },
  {
    // GUI for a locally running edgectl Mirage; reads nothing from the store, so no browser data
    id: "edgectl",
    label: "edgectl",
    icon: Network,
    basePath: "/edgectl",
    accentColor: "var(--module-edgectl)",
    navItems: [
      { href: "/edgectl", label: "Overview", icon: LayoutDashboard },
      { href: "/edgectl/ghosts", label: "Ghosts", icon: Ghost, also: ["/edgectl/ghost"] },
      { href: "/edgectl/seeds", label: "Seeds", icon: Sprout },
      { href: "/edgectl/routing", label: "Routing", icon: Route },
      { href: "/edgectl/intents", label: "Intents", icon: ListChecks, also: ["/edgectl/intent"] },
      {
        href: "/edgectl/dependencies",
        label: "Dependencies",
        icon: PackagePlus,
        also: ["/edgectl/dependency"],
      },
      { href: "/edgectl/activity", label: "Activity", icon: Activity },
    ],
    browserData: false,
  },
];

export function availableModules(source: DataSource): ModuleConfig[] {
  return source === "browser" ? modules.filter((m) => m.browserData) : modules;
}

function isUnder(pathname: string, base: string): boolean {
  return pathname === base || pathname.startsWith(`${base}/`);
}

/** The module a page belongs to */
export function moduleForPath(pathname: string): ModuleConfig | undefined {
  return modules.find((mod) => isUnder(pathname, mod.basePath));
}

/** Where a module opens: its first section, or its base path when it has none */
export function moduleHome(mod: ModuleConfig): string {
  return mod.navItems[0]?.href ?? mod.basePath;
}

/** Whether a page belongs to a section. The section at the module's base path owns only that page */
export function isNavItemActive(mod: ModuleConfig, item: NavItem, pathname: string): boolean {
  if (item.href === mod.basePath) return pathname === mod.basePath;
  return [item.href, ...(item.also ?? [])].some((base) => isUnder(pathname, base));
}

/** The dashboard and the module pages, as opposed to the landing page */
export function isAppPath(pathname: string): boolean {
  return pathname === "/dashboard" || moduleForPath(pathname) !== undefined;
}

export const globalNavItems: NavItem[] = [
  { href: "/", label: "Home", icon: Home },
  { href: "/dashboard", label: "Dashboard", icon: LayoutDashboard },
];
