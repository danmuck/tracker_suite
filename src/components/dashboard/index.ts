import type { ComponentType } from "react";
import { FigureCard } from "@/components/dashboard/figure-card";
import { FinanceCard } from "@/components/dashboard/finance-card";
import { FutureCard } from "@/components/dashboard/future-card";
import { LinksCard } from "@/components/dashboard/links-card";
import { ProjectsCard } from "@/components/dashboard/projects-card";

/** Home dashboard card for each module id in `src/lib/modules.ts` */
export const moduleCards: Record<string, ComponentType> = {
  finance: FinanceCard,
  figure: FigureCard,
  future: FutureCard,
  projects: ProjectsCard,
  links: LinksCard,
};
