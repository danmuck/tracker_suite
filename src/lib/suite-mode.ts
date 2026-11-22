/**
 * Deployment mode. Read on the server at request time, never baked into a
 * client bundle.
 *
 *   SUITE_MODE=local   modules (private tools and their data APIs) are served
 *   SUITE_MODE=public  only the landing page is served
 *
 * Unset, the suite is local under `next dev` and public in a production
 * build, so a deployment never exposes the modules unless it opts in. An
 * unrecognised value is treated as public.
 */
export type SuiteMode = "local" | "public";

export function suiteMode(): SuiteMode {
  const raw = process.env.SUITE_MODE?.trim().toLowerCase();
  if (raw === "local") return "local";
  if (raw) return "public";
  return process.env.NODE_ENV === "production" ? "public" : "local";
}

export function modulesEnabled(): boolean {
  return suiteMode() === "local";
}
