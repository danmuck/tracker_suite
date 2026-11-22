import { Wordmark } from "@/components/brand/wordmark";
import { site } from "@/lib/site";

export function SiteFooter() {
  return (
    <footer className="border-t">
      <div className="mx-auto flex max-w-6xl flex-wrap items-center gap-x-6 gap-y-2 px-6 py-8 text-sm text-muted-foreground">
        <Wordmark className="text-base text-foreground" />
        <span>© {new Date().getFullYear()}</span>
        <span className="ml-auto font-mono text-xs">
          {site.languages.join(" · ").toLowerCase()}
        </span>
      </div>
    </footer>
  );
}
