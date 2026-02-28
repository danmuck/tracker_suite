import {
  LayoutDashboard,
  Wallet,
  ArrowRightLeft,
  TrendingUp,
  BarChart3,
  DollarSign,
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
];

export const globalNavItems: NavItem[] = [
  { href: "/", label: "Dashboard", icon: LayoutDashboard },
];
