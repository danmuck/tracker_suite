import { Wordmark } from "@/components/brand/wordmark";
import { site } from "@/config/site";

export function SiteFooter({ local }: { local: boolean }) {
  return (
    <footer className="border-t">
      <div className="mx-auto flex max-w-5xl flex-wrap items-center gap-x-6 gap-y-2 px-6 py-8 text-sm text-muted-foreground">
        <Wordmark className="text-base text-foreground" />
        <span>© {new Date().getFullYear()}</span>
        <span className="ml-auto font-mono text-xs">
          {local ? "local mode · modules on" : site.languages.join(" · ").toLowerCase()}
        </span>
      </div>
    </footer>
  );
}
