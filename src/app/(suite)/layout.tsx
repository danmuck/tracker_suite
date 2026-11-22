import { notFound } from "next/navigation";
import { connection } from "next/server";
import { SidebarProvider, SidebarInset } from "@/components/ui/sidebar";
import { AppSidebar } from "@/components/app-sidebar";
import { AppHeader } from "@/components/app-header";
import { modulesEnabled } from "@/lib/suite-mode";

/** Shell for every module page. Modules only exist in local mode. */
export default async function SuiteLayout({ children }: { children: React.ReactNode }) {
  await connection();
  if (!modulesEnabled()) notFound();

  return (
    <SidebarProvider defaultOpen={true}>
      <AppSidebar />
      <SidebarInset>
        <AppHeader />
        <main className="flex-1 p-6">{children}</main>
      </SidebarInset>
    </SidebarProvider>
  );
}
