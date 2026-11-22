import { connection } from "next/server";
import { SiteHeader } from "@/components/site/site-header";
import { SiteFooter } from "@/components/site/site-footer";
import { modulesEnabled } from "@/lib/suite-mode";

export default async function SiteLayout({ children }: { children: React.ReactNode }) {
  // The mode is a runtime setting; never freeze it into a prerendered page.
  await connection();
  const local = modulesEnabled();

  return (
    <div className="flex min-h-svh flex-col">
      <SiteHeader local={local} />
      <main className="mx-auto w-full max-w-5xl flex-1 px-6">{children}</main>
      <SiteFooter local={local} />
    </div>
  );
}
