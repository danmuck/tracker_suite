import { About } from "@/components/site/about";
import { Contact } from "@/components/site/contact";
import { Hero } from "@/components/site/hero";
import { Projects } from "@/components/site/projects";

export default function HomePage() {
  return (
    <>
      <Hero />
      <Projects />
      <About />
      <Contact />
    </>
  );
}
