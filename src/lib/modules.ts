import {
  LayoutDashboard,
  Wallet,
  ArrowRightLeft,
  TrendingUp,
  Calculator,
  DollarSign,
  FolderKanban,
  Link2,
  Dumbbell,
  Salad,
  Building2,
  type LucideIcon,
} from "lucide-react";
import type { DataSource } from "@/lib/data/mode";

export interface NavItem {
  href: string;
  label: string;
  icon: LucideIcon;
}

export interface ModuleConfig {
  id: string;
  label: string;
  icon: LucideIcon;
  basePath: string;
  accentColor: string;
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
    browserData: false,
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
];

export function availableModules(source: DataSource): ModuleConfig[] {
  return source === "browser" ? modules.filter((m) => m.browserData) : modules;
}

export const globalNavItems: NavItem[] = [
  { href: "/", label: "Dashboard", icon: LayoutDashboard },
];
