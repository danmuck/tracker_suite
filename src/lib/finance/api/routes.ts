// Route table for the Finance API, dispatched against a Store.
// Pure: no framework, browser or server imports (browser-reachable).

import type { Handler, RouteDef } from "@/lib/data/api";
import { ConflictError } from "@/lib/data/store";
import {
  archiveAccount,
  createAccount,
  deleteAccount,
  getAccount,
  listAccounts,
  updateAccount,
} from "./account-handlers";
import { ensureCashAccount } from "./docs";

/** Every Finance route ensures the Cash account first, as connectDB's seed does on the server. */
const withCash =
  (handler: Handler): Handler =>
  async (ctx) => {
    await ensureCashAccount(ctx.store);
    return handler(ctx);
  };

/**
 * A unique-index race stays a plain error (the route's 500 failure string, as today)
 * instead of dispatch's 409 for ConflictError.
 */
// eslint-disable-next-line @typescript-eslint/no-unused-vars -- used by the category routes, added in a later task
const noConflict =
  (handler: Handler): Handler =>
  async (ctx) => {
    try {
      return await handler(ctx);
    } catch (error) {
      if (error instanceof ConflictError) throw new Error(error.message);
      throw error;
    }
  };

export const financeRoutes: RouteDef[] = [
  { method: "GET", path: "/api/accounts", handler: withCash(listAccounts), failure: "Failed to fetch accounts" },
  { method: "POST", path: "/api/accounts", handler: withCash(createAccount), failure: "Failed to create account" },
  { method: "GET", path: "/api/accounts/:accountId", handler: withCash(getAccount), failure: "Failed to fetch account" },
  { method: "PUT", path: "/api/accounts/:accountId", handler: withCash(updateAccount), failure: "Failed to update account" },
  { method: "PATCH", path: "/api/accounts/:accountId", handler: withCash(archiveAccount), failure: "Failed to update account" },
  { method: "DELETE", path: "/api/accounts/:accountId", handler: withCash(deleteAccount), failure: "Failed to delete account" },
];
