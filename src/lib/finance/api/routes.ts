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
import { createCategory, listCategories } from "./category-handlers";
import { ensureCashAccount } from "./docs";
import { getPlan, setupPlan, unlinkPlan, updatePlan } from "./payment-plan-handlers";
import {
  createTransaction,
  deleteTransaction,
  getTransaction,
  listTransactions,
  updateTransaction,
} from "./transaction-handlers";

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
  { method: "GET", path: "/api/accounts/:accountId/payment-plan", handler: withCash(getPlan), failure: "Failed to update payment plan" },
  { method: "POST", path: "/api/accounts/:accountId/payment-plan", handler: withCash(setupPlan), failure: "Failed to update payment plan" },
  { method: "PUT", path: "/api/accounts/:accountId/payment-plan", handler: withCash(updatePlan), failure: "Failed to update payment plan" },
  { method: "DELETE", path: "/api/accounts/:accountId/payment-plan", handler: withCash(unlinkPlan), failure: "Failed to update payment plan" },
  { method: "GET", path: "/api/transactions", handler: withCash(listTransactions), failure: "Failed to fetch transactions" },
  { method: "POST", path: "/api/transactions", handler: withCash(createTransaction), failure: "Failed to create transaction" },
  { method: "GET", path: "/api/transactions/:transactionId", handler: withCash(getTransaction), failure: "Failed to fetch transaction" },
  { method: "PUT", path: "/api/transactions/:transactionId", handler: withCash(updateTransaction), failure: "Failed to update transaction" },
  { method: "DELETE", path: "/api/transactions/:transactionId", handler: withCash(deleteTransaction), failure: "Failed to delete transaction" },
  { method: "GET", path: "/api/categories", handler: withCash(noConflict(listCategories)), failure: "Failed to fetch categories" },
  { method: "POST", path: "/api/categories", handler: withCash(noConflict(createCategory)), failure: "Failed to create category" },
];
