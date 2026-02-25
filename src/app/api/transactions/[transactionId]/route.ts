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

    if (!existingTransaction.isRecurring) {
      const oldReversal =
        existingTransaction.type === "credit"
          ? -existingTransaction.amount
          : existingTransaction.amount;

      await Account.findByIdAndUpdate(existingTransaction.accountId, {
        $inc: { balance: oldReversal },
      });
    }

    if (!validated.isRecurring) {
      const newEffect =
        validated.type === "credit" ? newAmountInCents : -newAmountInCents;

      await Account.findByIdAndUpdate(validated.accountId, {
        $inc: { balance: newEffect },
      });
    }

    const updatedTransaction = await Transaction.findByIdAndUpdate(
      transactionId,
      { ...validated, amount: newAmountInCents },
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

    if (!transaction.isRecurring) {
      const reversal =
        transaction.type === "credit"
          ? -transaction.amount
          : transaction.amount;

      await Account.findByIdAndUpdate(transaction.accountId, {
        $inc: { balance: reversal },
      });
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
