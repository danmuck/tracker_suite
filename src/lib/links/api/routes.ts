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
  { method: "GET", path: "/api/link-groups", handler: listGroups, failure: "Failed to fetch link groups" },
  { method: "POST", path: "/api/link-groups", handler: createGroup, failure: "Failed to create link group" },
  { method: "GET", path: "/api/link-groups/:groupId", handler: getGroup, failure: "Failed to fetch link group" },
  { method: "PUT", path: "/api/link-groups/:groupId", handler: updateGroup, failure: "Failed to update link group" },
  { method: "DELETE", path: "/api/link-groups/:groupId", handler: deleteGroup, failure: "Failed to delete link group" },
  { method: "GET", path: "/api/links", handler: listLinks, failure: "Failed to fetch links" },
  { method: "POST", path: "/api/links", handler: createLink, failure: "Failed to create link" },
  { method: "GET", path: "/api/links/:linkId", handler: getLink, failure: "Failed to fetch link" },
  { method: "PUT", path: "/api/links/:linkId", handler: updateLink, failure: "Failed to update link" },
  { method: "DELETE", path: "/api/links/:linkId", handler: deleteLink, failure: "Failed to delete link" },
];
