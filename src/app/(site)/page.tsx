import { connection } from "next/server";
import { Hero } from "@/components/site/hero";
import { Projects } from "@/components/site/projects";
import { About } from "@/components/site/about";
import { Contact } from "@/components/site/contact";
import { Workspace } from "@/components/site/workspace";
import { modulesEnabled } from "@/lib/suite-mode";

export default async function HomePage() {
  await connection();
  const local = modulesEnabled();

  return (
    <>
      <Hero compact={local} />
      {local && <Workspace />}
      <Projects />
      <About />
      <Contact />
    </>
  );
}
