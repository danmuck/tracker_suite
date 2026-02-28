import { NextRequest, NextResponse } from "next/server";
import { connectDB } from "@/lib/db";
import Transaction from "@/models/Transaction";
import Account from "@/models/Account";
import { transactionSchema } from "@/lib/validators";

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ transactionId: string }> }
) {
  try {
    await connectDB();

    const { transactionId } = await params;

    const transaction = await Transaction.findById(transactionId).lean();

    if (!transaction) {
      return NextResponse.json(
        { error: "Transaction not found" },
        { status: 404 }
      );
    }

    return NextResponse.json(transaction);
  } catch (error) {
    console.error("Error fetching transaction:", error);
    return NextResponse.json(
      { error: "Failed to fetch transaction" },
      { status: 500 }
    );
  }
}

export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ transactionId: string }> }
) {
  try {
    await connectDB();

    const { transactionId } = await params;

    const existingTransaction = await Transaction.findById(transactionId);

    if (!existingTransaction) {
      return NextResponse.json(
        { error: "Transaction not found" },
        { status: 404 }
      );
    }

    const body = await request.json();
    const validated = transactionSchema.parse(body);

    const newAmountInCents = Math.round(validated.amount * 100);

    // Determine if new date is in the future
    const newTxDate = new Date(validated.date);
    const startOfTomorrow = new Date();
    startOfTomorrow.setHours(0, 0, 0, 0);
    startOfTomorrow.setDate(startOfTomorrow.getDate() + 1);
    const newIsFuture = newTxDate >= startOfTomorrow;

    // Reverse old transaction effect only if it was previously applied to balances
    if (existingTransaction.balanceApplied) {
      if (existingTransaction.type === "transfer" && existingTransaction.toAccountId) {
        if (existingTransaction.amount > 0) {
          const oldSource = await Account.findById(existingTransaction.accountId);
          const oldDest = await Account.findById(existingTransaction.toAccountId);
          const oldIsDebtSource = oldSource?.type === "credit_card" || oldSource?.type === "debt";
          const oldIsDebtDest = oldDest?.type === "credit_card" || oldDest?.type === "debt";

          await Account.bulkWrite([
            {
              updateOne: {
                filter: { _id: existingTransaction.accountId },
                update: { $inc: { balance: oldIsDebtSource ? -existingTransaction.amount : existingTransaction.amount } },
              },
            },
            {
              updateOne: {
                filter: { _id: existingTransaction.toAccountId },
                update: { $inc: { balance: oldIsDebtDest ? existingTransaction.amount : -existingTransaction.amount } },
              },
            },
          ]);
        }
      } else {
        const oldAcct = await Account.findById(existingTransaction.accountId);
        const oldIsDebt = oldAcct?.type === "credit_card" || oldAcct?.type === "debt";
        let oldReversal: number;
        if (oldIsDebt) {
          oldReversal = existingTransaction.type === "credit" ? existingTransaction.amount : -existingTransaction.amount;
        } else {
          oldReversal = existingTransaction.type === "credit" ? -existingTransaction.amount : existingTransaction.amount;
        }

        await Account.findByIdAndUpdate(existingTransaction.accountId, {
          $inc: { balance: oldReversal },
        });
      }
    }

    // Apply new transaction effect only if date is today or earlier and not recurring
    let finalNewAmount = newAmountInCents;
    const shouldApplyNew = !validated.isRecurring && !newIsFuture;

    if (validated.type === "transfer" && !validated.isRecurring) {
      const [sourceAccount, destAccount] = await Promise.all([
        Account.findById(validated.accountId),
        Account.findById(validated.toAccountId),
      ]);

      if (!sourceAccount || !destAccount) {
        return NextResponse.json(
          { error: "Source or destination account not found" },
          { status: 400 }
        );
      }

      const isDebtSource = sourceAccount.type === "credit_card" || sourceAccount.type === "debt";
      const isDebtDest = destAccount.type === "credit_card" || destAccount.type === "debt";

      // Credit limit cap (positive balance = owed, available = limit - owed)
      if (sourceAccount.type === "credit_card" && sourceAccount.creditLimit) {
        const availableCredit = sourceAccount.creditLimit - sourceAccount.balance;
        if (availableCredit <= 0) {
          finalNewAmount = 0;
        } else {
          finalNewAmount = Math.min(finalNewAmount, availableCredit);
        }
      }

      // Debt cap (positive balance = owed)
      if (isDebtDest) {
        const owed = destAccount.balance;
        if (owed <= 0) {
          finalNewAmount = 0;
        } else {
          finalNewAmount = Math.min(finalNewAmount, owed);
        }
      }

      if (shouldApplyNew && finalNewAmount > 0) {
        await Account.bulkWrite([
          {
            updateOne: {
              filter: { _id: validated.accountId },
              update: { $inc: { balance: isDebtSource ? finalNewAmount : -finalNewAmount } },
            },
          },
          {
            updateOne: {
              filter: { _id: validated.toAccountId },
              update: { $inc: { balance: isDebtDest ? -finalNewAmount : finalNewAmount } },
            },
          },
        ]);
      }
    } else if (shouldApplyNew) {
      const newAcct = await Account.findById(validated.accountId);
      const newIsDebt = newAcct?.type === "credit_card" || newAcct?.type === "debt";
      let newEffect: number;
      if (newIsDebt) {
        newEffect = validated.type === "credit" ? -newAmountInCents : newAmountInCents;
      } else {
        newEffect = validated.type === "credit" ? newAmountInCents : -newAmountInCents;
      }

      await Account.findByIdAndUpdate(validated.accountId, {
        $inc: { balance: newEffect },
      });
    }

    const savedAmount = validated.type === "transfer" ? finalNewAmount : newAmountInCents;
    const updatedTransaction = await Transaction.findByIdAndUpdate(
      transactionId,
      { ...validated, amount: savedAmount, balanceApplied: shouldApplyNew },
      { new: true, runValidators: true }
    ).lean();

    return NextResponse.json(updatedTransaction);
  } catch (error) {
    if (
      error instanceof Error &&
      error.name === "ZodError"
    ) {
      return NextResponse.json(
        { error: "Validation failed", details: error },
        { status: 400 }
      );
    }
    console.error("Error updating transaction:", error);
    return NextResponse.json(
      { error: "Failed to update transaction" },
      { status: 500 }
    );
  }
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ transactionId: string }> }
) {
  try {
    await connectDB();

    const { transactionId } = await params;

    const transaction = await Transaction.findById(transactionId);

    if (!transaction) {
      return NextResponse.json(
        { error: "Transaction not found" },
        { status: 404 }
      );
    }

    // Only reverse balance if it was previously applied
    if (transaction.balanceApplied) {
      if (transaction.type === "transfer" && transaction.toAccountId) {
        if (transaction.amount > 0) {
          const delSource = await Account.findById(transaction.accountId);
          const delDest = await Account.findById(transaction.toAccountId);
          const delIsDebtSource = delSource?.type === "credit_card" || delSource?.type === "debt";
          const delIsDebtDest = delDest?.type === "credit_card" || delDest?.type === "debt";

          await Account.bulkWrite([
            {
              updateOne: {
                filter: { _id: transaction.accountId },
                update: { $inc: { balance: delIsDebtSource ? -transaction.amount : transaction.amount } },
              },
            },
            {
              updateOne: {
                filter: { _id: transaction.toAccountId },
                update: { $inc: { balance: delIsDebtDest ? transaction.amount : -transaction.amount } },
              },
            },
          ]);
        }
      } else {
        const delAcct = await Account.findById(transaction.accountId);
        const delIsDebtAcct = delAcct?.type === "credit_card" || delAcct?.type === "debt";
        let reversal: number;
        if (delIsDebtAcct) {
          reversal = transaction.type === "credit" ? transaction.amount : -transaction.amount;
        } else {
          reversal = transaction.type === "credit" ? -transaction.amount : transaction.amount;
        }

        await Account.findByIdAndUpdate(transaction.accountId, {
          $inc: { balance: reversal },
        });
      }
    }

    await Transaction.findByIdAndDelete(transactionId);

    return NextResponse.json({ message: "Transaction deleted successfully" });
  } catch (error) {
    console.error("Error deleting transaction:", error);
    return NextResponse.json(
      { error: "Failed to delete transaction" },
      { status: 500 }
    );
  }
}
