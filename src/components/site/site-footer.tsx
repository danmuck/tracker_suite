import { Wordmark } from "@/components/brand/wordmark";

export function SiteFooter() {
	return (
		<footer className="border-t content-center">
			<div className="text-muted-foreground mx-auto flex w-full max-w-6xl flex-wrap items-center gap-x-6 gap-y-2 px-6 py-8 text-sm">
				<Wordmark className="text-foreground text-base" />
				<span>© {new Date().getFullYear()}</span>
				{/*<span className="font-mono text-xs sm:ml-auto">{site.languages.join(" · ")}</span>*/}
			</div>
		</footer>
	);
}
