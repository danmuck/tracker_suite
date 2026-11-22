import Link from "next/link";
import { Wordmark } from "@/components/brand/wordmark";
import { DataSourceSwitch } from "@/components/data-source-switch";
import { ThemeToggle } from "@/components/theme-toggle";

const sections = [
  { href: "/#workspace", label: "Workspace" },
  { href: "/#projects", label: "Projects" },
  { href: "/#about", label: "About" },
  { href: "/#contact", label: "Contact" },
];

export function SiteHeader() {
  return (
    <header className="sticky top-0 z-40 border-b bg-background/85 backdrop-blur">
      <div className="mx-auto flex h-14 max-w-6xl items-center gap-4 px-6">
        <Link href="/" aria-label="dan muck, home">
          <Wordmark className="text-xl" />
        </Link>
        <nav
          aria-label="Sections"
          className="ml-auto hidden items-center gap-5 text-sm text-muted-foreground sm:flex"
        >
          {sections.map(({ href, label }) => (
            <Link key={href} href={href} className="transition-colors hover:text-foreground">
              {label}
            </Link>
          ))}
        </nav>
        <div className="ml-auto flex items-center gap-1 sm:ml-0">
          <DataSourceSwitch />
          <ThemeToggle />
        </div>
      </div>
    </header>
  );
}
