// Route table for the Links API, dispatched against a Store.
// Pure: no framework, browser or server imports.

import type { RouteDef } from "@/lib/data/api";
import {
  createGroup,
  createLink,
  deleteGroup,
  deleteLink,
  getGroup,
  getLink,
  listGroups,
  listLinks,
  updateGroup,
  updateLink,
} from "./handlers";

export const linksRoutes: RouteDef[] = [
  { method: "GET", path: "/api/link-groups", handler: listGroups },
  { method: "POST", path: "/api/link-groups", handler: createGroup },
  { method: "GET", path: "/api/link-groups/:groupId", handler: getGroup },
  { method: "PUT", path: "/api/link-groups/:groupId", handler: updateGroup },
  { method: "DELETE", path: "/api/link-groups/:groupId", handler: deleteGroup },
  { method: "GET", path: "/api/links", handler: listLinks },
  { method: "POST", path: "/api/links", handler: createLink },
  { method: "GET", path: "/api/links/:linkId", handler: getLink },
  { method: "PUT", path: "/api/links/:linkId", handler: updateLink },
  { method: "DELETE", path: "/api/links/:linkId", handler: deleteLink },
];
