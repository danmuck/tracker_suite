import { SiteFooter } from "@/components/site/site-footer";

// The nav bar comes from the root layout, so it stays put between the landing page and the app
export default function SiteLayout({ children }: { children: React.ReactNode }) {
  return (
    <>
      <main className="mx-auto w-full max-w-6xl flex-1 px-6">{children}</main>
      <SiteFooter />
    </>
  );
}
