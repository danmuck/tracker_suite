"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { LayoutDashboard } from "lucide-react";
import { Logo } from "@/components/brand/logo";
import { ThemeToggle } from "@/components/theme-toggle";
import { SidebarTrigger } from "@/components/ui/sidebar";
import { isAppPath } from "@/lib/modules";

const anchors = [
	{ href: "/#projects", label: "Projects" },
	{ href: "/#about", label: "About" },
	{ href: "/#contact", label: "Contact" },
];

export function SiteHeader() {
	const pathname = usePathname();
	// The Demos button is hidden while the dashboard or a module page is open
	const inDemos = isAppPath(pathname);

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
			{/* Pinned to the far left of the bar, outside the centered row */}
			<SidebarTrigger className="absolute top-1/2 left-3 -translate-y-1/2" />
			{/* Extra left padding keeps the logo clear of the toggle until the row has side margins */}
			<div className="mx-auto flex h-14 w-full max-w-6xl items-center gap-6 pr-6 pl-14 xl:pl-6">
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
							className="text-muted-foreground hover:text-foreground inline-flex items-center gap-1.5 text-sm transition-colors"
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
