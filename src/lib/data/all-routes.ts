// Every module's route table. Imported by the server adapter and, later, by browser data mode.
// Pure: no framework, browser or server imports.

import type { RouteDef } from "./api";
import { linksRoutes } from "@/lib/links/api/routes";

export const allRoutes: RouteDef[] = [...linksRoutes];
