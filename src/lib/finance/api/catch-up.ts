// The catch-up step the Finance reads run before they answer: apply transactions whose day has
// arrived, then post due payment-plan payments. Same order on every route that does it, so a
// charge dated on or before a due date counts toward what is owed whichever route runs first.
// Pure: no framework, browser or server imports (browser-reachable).

import type { Store } from "@/lib/data/store";
import { firstFutureInstant } from "@/lib/finance/dates";
import { accounts, isDebtType, shapeAccount, shapeTransaction, transactions, type TransactionDoc } from "./docs";
import { postDuePayments } from "./post-payments";

/** One pending transaction's effect on its account balances. */
async function applyBalance(store: Store, tx: TransactionDoc): Promise<void> {
  const acc = accounts(store);
  if (tx.type === "transfer" && tx.toAccountId) {
    const [sourceRaw, destRaw] = await Promise.all([acc.findById(tx.accountId), acc.findById(tx.toAccountId)]);
    const isDebtSource = isDebtType(sourceRaw ? shapeAccount(sourceRaw).type : undefined);
    const isDebtDest = isDebtType(destRaw ? shapeAccount(destRaw).type : undefined);
    await acc.batchUpdate([
      { filter: { _id: tx.accountId }, update: { $inc: { balance: isDebtSource ? tx.amount : -tx.amount } } },
      { filter: { _id: tx.toAccountId }, update: { $inc: { balance: isDebtDest ? -tx.amount : tx.amount } } },
    ]);
    return;
  }
  const raw = await acc.findById(tx.accountId);
  const isDebt = isDebtType(raw ? shapeAccount(raw).type : undefined);
  let balanceChange: number;
  if (isDebt) {
    balanceChange = tx.type === "credit" ? -tx.amount : tx.amount;
  } else {
    balanceChange = tx.type === "credit" ? tx.amount : -tx.amount;
  }
  await acc.updateById(tx.accountId, { $inc: { balance: balanceChange } });
}

/** Apply every non-recurring transaction dated today or earlier (local calendar day) that is not yet applied. */
export async function applyPendingTransactions(store: Store, now: Date): Promise<void> {
  const txs = transactions(store);
  const due = { balanceApplied: false, isRecurring: { $ne: true }, date: { $lt: firstFutureInstant(now) } };
  const pending = await txs.find(due);

  for (const { _id } of pending) {
    // Claim it before touching a balance (bug 9). Only the request whose conditional update
    // matched applies it; the claimed document is the one applied.
    const claimed = await txs.updateOne({ ...due, _id }, { $set: { balanceApplied: true } });
    if (!claimed) continue;
    const tx = shapeTransaction(claimed);
    if (tx.amount === 0) continue;

    try {
      await applyBalance(store, tx);
    } catch (error) {
      // Release the claim so a later request applies it
      try {
        await txs.updateOne({ _id, balanceApplied: true }, { $set: { balanceApplied: false } });
      } catch {
        // The balance failure is the one reported; a failed release must not replace it
      }
      throw error;
    }
  }
}

/**
 * Bring stored balances up to today: apply pending transactions, then post due plan payments,
 * so a charge dated today or earlier counts toward what is owed. Writes made here are not the
 * request's own: a route may still answer 4xx after them.
 */
export async function catchUp(store: Store, now: Date): Promise<void> {
  await applyPendingTransactions(store, now);
  await postDuePayments(store, now);
}
