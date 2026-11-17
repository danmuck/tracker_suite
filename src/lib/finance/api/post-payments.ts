// Due payment-plan payments, posted over the Store, once each (run before the Finance reads that
// show balances or projections). Same logic and call order in both data sources.
// Pure: no framework, browser or server imports (browser-reachable).

import type { Store } from "@/lib/data/store";
import { localDateStr, toDateStr, toIso } from "@/lib/finance/dates";
import { dueOccurrences } from "@/lib/finance/posting";
import { accounts, isDebtType, shapeAccount, shapeTransaction, transactions } from "./docs";

/**
 * Post every due, not-yet-posted payment-plan payment to account balances
 * (bank → debt/credit card), capped at what is owed. Backdated plans catch up.
 * Each batch is claimed with a conditional update on `postedThrough`, so
 * concurrent requests can't post the same payment twice.
 */
export async function postDuePayments(store: Store, now: Date): Promise<void> {
  const acc = accounts(store);
  const txs = transactions(store);
  const today = localDateStr(now);
  // P1
  const debts = (await acc.find({ paymentTransactionId: { $ne: null }, isArchived: { $ne: true } })).map(shapeAccount);

  for (const debt of debts) {
    // P2
    const raw = await txs.findById(debt.paymentTransactionId as string);
    const tx = raw ? shapeTransaction(raw) : null;
    if (!tx?.recurrenceRule || tx.type !== "transfer" || !tx.toAccountId) continue;
    if (tx.toAccountId !== debt._id) continue;

    const previous = tx.postedThrough ?? null;
    const rule = tx.recurrenceRule;
    const due = dueOccurrences(
      {
        frequency: rule.frequency,
        interval: rule.interval,
        startDate: toDateStr(rule.startDate),
        endDate: rule.endDate ? toDateStr(rule.endDate) : null,
        dayOfWeek: rule.dayOfWeek,
        dayOfMonth: rule.dayOfMonth,
        daysOfMonth: rule.daysOfMonth,
      },
      tx.amountSchedule,
      tx.amount,
      previous ? toDateStr(previous) : null,
      today,
    );
    if (due.length === 0) continue;

    // P3: claim the batch first; if another request already moved postedThrough, skip
    const claimed = await txs.updateOne(
      { _id: tx._id, postedThrough: previous ?? null }, // null matches null or missing
      { $set: { postedThrough: toIso(due[due.length - 1].date) } },
    );
    if (!claimed) continue;

    // P4
    const sourceRaw = await acc.findById(tx.accountId);
    const source = sourceRaw ? shapeAccount(sourceRaw) : null;
    let owed = debt.balance;
    let total = 0;
    for (const o of due) {
      const amount = Math.max(0, Math.min(o.amount, owed));
      owed -= amount;
      total += amount;
    }
    if (total === 0) continue;

    // P5
    await acc.batchUpdate([
      { filter: { _id: debt._id }, update: { $inc: { balance: -total } } },
      ...(source
        ? [{ filter: { _id: source._id }, update: { $inc: { balance: isDebtType(source.type) ? total : -total } } }]
        : []),
    ]);
  }
}
