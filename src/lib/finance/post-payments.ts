import Account from "@/models/finance/Account";
import Transaction from "@/models/finance/Transaction";
import { localTodayStr, toDateStr } from "./dates";
import { dueOccurrences } from "./posting";

const isLiability = (type: string) => type === "credit_card" || type === "debt";

/**
 * Post every due, not-yet-posted payment-plan payment to account balances
 * (bank → debt/credit card), capped at what is owed. Backdated plans catch up.
 * Each batch is claimed with a conditional update on `postedThrough`, so
 * concurrent requests can't post the same payment twice.
 */
export async function postDuePayments(): Promise<void> {
  const today = localTodayStr();
  const accounts = await Account.find({ paymentTransactionId: { $ne: null }, isArchived: { $ne: true } });

  for (const debt of accounts) {
    const tx = await Transaction.findById(debt.paymentTransactionId);
    if (!tx?.recurrenceRule || tx.type !== "transfer" || !tx.toAccountId) continue;
    if (tx.toAccountId.toString() !== debt._id.toString()) continue;

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
      today
    );
    if (due.length === 0) continue;

    // Claim the batch first; if another request already moved postedThrough, skip
    const claimed = await Transaction.updateOne(
      { _id: tx._id, postedThrough: previous ?? null }, // null matches null or missing
      { $set: { postedThrough: new Date(due[due.length - 1].date) } }
    );
    if (claimed.modifiedCount !== 1) continue;

    const source = await Account.findById(tx.accountId);
    let owed = debt.balance;
    let total = 0;
    for (const o of due) {
      const amount = Math.max(0, Math.min(o.amount, owed));
      owed -= amount;
      total += amount;
    }
    if (total === 0) continue;

    await Account.bulkWrite([
      { updateOne: { filter: { _id: debt._id }, update: { $inc: { balance: -total } } } },
      ...(source
        ? [{ updateOne: { filter: { _id: source._id }, update: { $inc: { balance: isLiability(source.type) ? total : -total } } } }]
        : []),
    ]);
  }
}
