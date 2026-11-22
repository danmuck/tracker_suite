import { About } from "@/components/site/about";
import { Contact } from "@/components/site/contact";
import { Hero } from "@/components/site/hero";
import { Projects } from "@/components/site/projects";
import { Workspace } from "@/components/site/workspace";

// Same flag as IS_DEMO in src/lib/data/mode.ts, which only client components can import.
const isPublicBuild = process.env.NEXT_PUBLIC_DEMO === "1";

export default function HomePage() {
  return (
    <>
      {/* On the owner's server the page is a dashboard first, so the hero steps back. */}
      <Hero compact={!isPublicBuild} />
      <Workspace />
      <Projects />
      <About />
      <Contact />
    </>
  );
}
