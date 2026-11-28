import Link from "next/link";
import type { LucideIcon } from "lucide-react";
import { cn } from "@/lib/utils";

export interface TabNavItem {
  href: string;
  label: string;
  icon: LucideIcon;
  active: boolean;
}

interface TabNavProps {
  /** Names the strip for screen readers, e.g. "Finance sections" */
  label: string;
  items: TabNavItem[];
  /** Underline colour of the current tab */
  accentColor: string;
}

/** A row of page links drawn as tabs. Scrolls sideways when the tabs do not fit */
export function TabNav({ label, items, accentColor }: TabNavProps) {
  return (
    <nav aria-label={label} className="flex shrink-0 gap-1 overflow-x-auto border-b px-4">
      {items.map(({ href, label: text, icon: Icon, active }) => (
        <Link
          key={href}
          href={href}
          aria-current={active ? "page" : undefined}
          style={active ? { borderColor: accentColor } : undefined}
          className={cn(
            "inline-flex h-10 shrink-0 items-center gap-1.5 border-b-2 border-transparent px-3 text-sm font-medium whitespace-nowrap transition-colors",
            "focus-visible:ring-ring/50 outline-none focus-visible:ring-[3px]",
            active ? "text-foreground" : "text-muted-foreground hover:text-foreground"
          )}
        >
          <Icon className="h-4 w-4" />
          {text}
        </Link>
      ))}
    </nav>
  );
}
