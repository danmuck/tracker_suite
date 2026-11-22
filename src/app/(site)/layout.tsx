import { SiteFooter } from "@/components/site/site-footer";
import { SiteHeader } from "@/components/site/site-header";
import { TooltipProvider } from "@/components/ui/tooltip";

export default function SiteLayout({ children }: { children: React.ReactNode }) {
  return (
    // ThemeToggle needs a TooltipProvider; inside the app shell the sidebar supplies one
    <TooltipProvider delayDuration={0}>
      <div className="flex min-h-svh flex-col">
        <SiteHeader />
        <main className="mx-auto w-full max-w-6xl flex-1 px-6">{children}</main>
        <SiteFooter />
      </div>
    </TooltipProvider>
  );
}
