import { About } from "@/components/site/about";
import { Contact } from "@/components/site/contact";
import { Hero } from "@/components/site/hero";
import { Projects } from "@/components/site/projects";

// Read the flag directly: src/lib/data/mode.ts uses a client hook and cannot load in a server component
const isPublic = process.env.NEXT_PUBLIC_DEMO === "1";

export default function HomePage() {
  return (
    <>
      <Hero compact={!isPublic} />
      <Projects />
      <About />
      <Contact />
    </>
  );
}
