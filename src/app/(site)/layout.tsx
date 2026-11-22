import { TooltipProvider } from "@/components/ui/tooltip";
import { SiteHeader } from "@/components/site/site-header";
import { SiteFooter } from "@/components/site/site-footer";

/** The landing page: full width under a top bar, outside the module sidebar shell. */
export default function SiteLayout({ children }: { children: React.ReactNode }) {
  return (
    <TooltipProvider delayDuration={0}>
      <div className="flex min-h-svh flex-col">
        <SiteHeader />
        <main className="mx-auto w-full max-w-6xl flex-1 px-6">{children}</main>
        <SiteFooter />
      </div>
    </TooltipProvider>
  );
}
