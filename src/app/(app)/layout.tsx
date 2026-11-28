import { AppHeader } from "@/components/app-header";
import { ModuleGate } from "@/components/module-gate";
import { ModuleTabs } from "@/components/module-tabs";

// The nav bar and the sidebar come from AppShell in the root layout
export default function AppLayout({ children }: { children: React.ReactNode }) {
  return (
    <>
      <AppHeader />
      <ModuleTabs />
      <main className="flex-1 p-6">
        <ModuleGate>{children}</ModuleGate>
      </main>
    </>
  );
}
