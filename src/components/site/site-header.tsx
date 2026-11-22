import Link from "next/link";
import { Wordmark } from "@/components/brand/wordmark";
import { DataSourceSwitch } from "@/components/data-source-switch";
import { ThemeToggle } from "@/components/theme-toggle";

const anchors = [
  { href: "/#workspace", label: "Workspace" },
  { href: "/#projects", label: "Projects" },
  { href: "/#about", label: "About" },
  { href: "/#contact", label: "Contact" },
];

export function SiteHeader() {
  return (
    <header className="bg-background/80 sticky top-0 z-40 border-b backdrop-blur">
      <div className="mx-auto flex h-14 w-full max-w-6xl items-center gap-6 px-6">
        <Link href="/" aria-label="Home">
          <Wordmark className="text-xl" />
        </Link>
        <nav className="hidden items-center gap-5 sm:flex">
          {anchors.map((a) => (
            <a
              key={a.href}
              href={a.href}
              className="text-muted-foreground hover:text-foreground text-sm transition-colors"
            >
              {a.label}
            </a>
          ))}
        </nav>
        <div className="ml-auto flex items-center gap-1">
          <DataSourceSwitch />
          <ThemeToggle />
        </div>
      </div>
    </header>
  );
}
