import {
  ArrowRightLeft,
  BarChart3,
  LayoutDashboard,
  TrendingUp,
  Wallet,
  type LucideIcon,
} from "lucide-react";

/**
 * Registry of suite modules.
 *
 * A module is a private tool that only exists when the suite runs in local
 * mode (see `src/lib/suite-mode.ts`). Everything under a module's `basePath`
 * and `apiPrefix` is blocked in public mode by `src/proxy.ts`, so adding a
 * module here is what puts its routes behind the gate.
 */
export interface ModuleNavItem {
  href: string;
  label: string;
  icon: LucideIcon;
}

export interface SuiteModule {
  id: string;
  name: string;
  description: string;
  /** Page route prefix, e.g. `/finance`. */
  basePath: string;
  /** API route prefix, e.g. `/api/finance`. */
  apiPrefix: string;
  icon: LucideIcon;
  /** First item is the module's own overview page. */
  nav: ModuleNavItem[];
}

export const modules: SuiteModule[] = [
  {
    id: "finance",
    name: "Finance",
    description: "Accounts, transactions, projections and reports.",
    basePath: "/finance",
    apiPrefix: "/api/finance",
    icon: Wallet,
    nav: [
      { href: "/finance", label: "Overview", icon: LayoutDashboard },
      { href: "/finance/accounts", label: "Accounts", icon: Wallet },
      { href: "/finance/transactions", label: "Transactions", icon: ArrowRightLeft },
      { href: "/finance/projections", label: "Projections", icon: TrendingUp },
      { href: "/finance/reports", label: "Reports", icon: BarChart3 },
    ],
  },
];

function hasPrefix(pathname: string, prefix: string): boolean {
  return pathname === prefix || pathname.startsWith(`${prefix}/`);
}

/** True when the path belongs to any module (page or API). */
export function isModulePath(pathname: string): boolean {
  return modules.some(
    (m) => hasPrefix(pathname, m.basePath) || hasPrefix(pathname, m.apiPrefix)
  );
}

export function findModule(pathname: string): SuiteModule | undefined {
  return modules.find((m) => hasPrefix(pathname, m.basePath));
}

/** The nav item matching the path, preferring the most specific href. */
export function findNavItem(pathname: string): ModuleNavItem | undefined {
  return findModule(pathname)
    ?.nav.filter((item) => hasPrefix(pathname, item.href))
    .sort((a, b) => b.href.length - a.href.length)[0];
}
