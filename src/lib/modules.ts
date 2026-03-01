import {
  LayoutDashboard,
  Wallet,
  ArrowRightLeft,
  TrendingUp,
  BarChart3,
  DollarSign,
  FolderKanban,
  Link2,
  type LucideIcon,
} from "lucide-react";

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
      { href: "/finance/reports", label: "Reports", icon: BarChart3 },
    ],
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
  },
  {
    id: "links",
    label: "Links",
    icon: Link2,
    basePath: "/links",
    accentColor: "var(--chart-4)",
    navItems: [],
  },
];

export const globalNavItems: NavItem[] = [
  { href: "/", label: "Dashboard", icon: LayoutDashboard },
];
