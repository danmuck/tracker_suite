import Link from "next/link";
import { Wordmark } from "@/components/brand/wordmark";
import { ThemeToggle } from "@/components/theme-toggle";

interface SiteHeaderProps {
  /** Adds the workspace link when the suite runs in local mode. */
  local: boolean;
}

const sections = [
  { href: "/#projects", label: "Projects" },
  { href: "/#about", label: "About" },
  { href: "/#contact", label: "Contact" },
];

export function SiteHeader({ local }: SiteHeaderProps) {
  return (
    <header className="sticky top-0 z-40 border-b bg-background/85 backdrop-blur">
      <div className="mx-auto flex h-14 max-w-5xl items-center gap-6 px-6">
        <Link href="/" aria-label="dan muck, home">
          <Wordmark className="text-xl" />
        </Link>
        <nav
          aria-label="Sections"
          className="ml-auto flex items-center gap-5 text-sm text-muted-foreground"
        >
          {local && (
            <Link
              href="/#workspace"
              className="flex items-center gap-1.5 font-medium text-foreground"
            >
              <span aria-hidden className="size-1.5 rounded-full bg-brand" />
              Workspace
            </Link>
          )}
          {sections.map(({ href, label }) => (
            <Link
              key={href}
              href={href}
              className="hidden transition-colors hover:text-foreground sm:inline"
            >
              {label}
            </Link>
          ))}
        </nav>
        <ThemeToggle />
      </div>
    </header>
  );
}
