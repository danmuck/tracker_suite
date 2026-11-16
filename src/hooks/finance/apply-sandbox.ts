"use client";

import { mutate } from "swr";
import { createTransaction, deleteTransaction, updateTransaction } from "@/hooks/finance/use-transactions";
import { saveFinanceProfile } from "@/hooks/finance/use-finance-profile";
import { projectionSandbox, type SandboxState } from "@/hooks/finance/use-projection-sandbox";

/**
 * Write the sandbox into real data through the same API calls the Transactions
 * and Datasheet pages use, so balances, payment plans and schedules stay
 * consistent. Changes are applied one at a time; if one fails, the ones not yet
 * applied go back into the sandbox.
 */
export async function applySandboxToRealData(snapshot: SandboxState) {
  const remaining = {
    added: [...snapshot.added],
    edited: { ...snapshot.edited },
    removed: [...snapshot.removed],
    profile: snapshot.profile,
  };
  // Emptied first so the real-data-changed check does not fire mid-apply
  projectionSandbox.clear();

  let applied = 0;
  let error: string | undefined;
  try {
    for (const id of snapshot.removed) {
      await deleteTransaction(id);
      remaining.removed = remaining.removed.filter((r) => r !== id);
      applied++;
    }
    for (const [id, data] of Object.entries(snapshot.edited)) {
      await updateTransaction(id, data);
      delete remaining.edited[id];
      applied++;
    }
    for (const a of snapshot.added) {
      await createTransaction(a.data);
      remaining.added = remaining.added.filter((x) => x.id !== a.id);
      applied++;
    }
    if (snapshot.profile) {
      await saveFinanceProfile(snapshot.profile);
      remaining.profile = null;
      applied++;
    }
  } catch (err) {
    error = err instanceof Error ? err.message : "Something went wrong";
  }

  // Refresh everything that reads accounts, transactions or the Datasheet
  await mutate(() => true);
  if (error) projectionSandbox.replace(remaining);
  return { applied, error };
}
