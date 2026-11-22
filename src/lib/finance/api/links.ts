// References between Finance documents, kept in step when a document goes away (bugs 7 and 13).
// Pure: no framework, browser or server imports (browser-reachable).
//
// Every stored reference (src/models/finance, src/types/finance):
//   transaction.accountId, transaction.toAccountId → account   (deleteAccount removes or clears them)
//   account.linkedAccountId                         → account   (clearAccountLinks)
//   account.paymentTransactionId                    → transaction
//   profile.salaryTransactionId, rentTransactionId   → transaction (merge-rent moves a Rent link)
// The last three are the transaction references below. Each write matches only the documents that
// hold the reference, so a delete that references nothing writes nothing here.

import type { Store } from "@/lib/data/store";
import { accounts, profiles, transactions } from "./docs";

/** Unlinks deleted transactions: plans lose their payment transfer, the Datasheet its Salary/Rent link. */
export async function clearTransactionLinks(store: Store, ids: string[]): Promise<void> {
  if (ids.length === 0) return;
  await accounts(store).updateMany({ paymentTransactionId: { $in: ids } }, { $unset: { paymentTransactionId: 1 } });
  await profiles(store).updateMany({ salaryTransactionId: { $in: ids } }, { $set: { salaryTransactionId: null } });
  await profiles(store).updateMany({ rentTransactionId: { $in: ids } }, { $set: { rentTransactionId: null } });
}

/**
 * After an account is deleted: other accounts drop their `linkedAccountId` to it, and a surviving
 * debit or credit still naming it as `toAccountId` (stored before bug 2 was fixed) drops that too.
 */
export async function clearAccountLinks(store: Store, accountId: string): Promise<void> {
  await accounts(store).updateMany({ linkedAccountId: accountId }, { $unset: { linkedAccountId: 1 } });
  await transactions(store).updateMany({ toAccountId: accountId }, { $unset: { toAccountId: 1 } });
}
