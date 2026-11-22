"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { LayoutDashboard } from "lucide-react";
import { Logo } from "@/components/brand/logo";
import { ThemeToggle } from "@/components/theme-toggle";
import { modules } from "@/lib/modules";

const anchors = [
	{ href: "/#projects", label: "Projects" },
	{ href: "/#about", label: "About" },
	{ href: "/#contact", label: "Contact" },
];

export function SiteHeader() {
	const pathname = usePathname();
	// The dashboard and the module pages: the Demos button is hidden while they are open
	const inDemos =
		pathname === "/dashboard" ||
		modules.some((mod) => pathname === mod.basePath || pathname.startsWith(`${mod.basePath}/`));

	const goHome = (event: React.MouseEvent) => {
		// From another page the router lands at the top. Already home, a link to "/" does
		// not scroll, so drop any #section from the address and scroll up by hand
		if (pathname !== "/") return;
		event.preventDefault();
		if (window.location.hash) window.history.replaceState(null, "", "/");
		window.scrollTo({ top: 0, behavior: "instant" });
	};

	return (
		<header className="bg-background/80 sticky top-0 z-40 border-b border-brand backdrop-blur">
			<div className="mx-auto flex h-14 w-full max-w-6xl items-center gap-6 px-6">
				<Link href="/" aria-label="Home" onClick={goHome}>
					<Logo />
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
				<div className="ml-auto flex items-center gap-3">
					{inDemos ? null : (
						<Link
							href="/dashboard"
							className="hover:bg-accent inline-flex items-center gap-1.5 rounded-full border border-brand px-3 py-1.5 text-sm font-medium transition-colors"
						>
							<LayoutDashboard className="size-4" aria-hidden />
							Demos
						</Link>
					)}
					<ThemeToggle />
				</div>
			</div>
		</header>
	);
}
