import { NextRequest, NextResponse } from "next/server";
import { connectDB } from "@/lib/db";
import Account from "@/models/finance/Account";
import Transaction from "@/models/finance/Transaction";
import { accountSchema } from "@/lib/finance/validators";

// GET /api/accounts — list accounts, optional ?type= filter
export async function GET(request: NextRequest) {
  try {
    await connectDB();

    const { searchParams } = request.nextUrl;
    const type = searchParams.get("type");

    const filter: Record<string, string> = {};
    if (type) {
      filter.type = type;
    }

    // Apply any pending transactions whose date has arrived
    const startOfTomorrow = new Date();
    startOfTomorrow.setHours(0, 0, 0, 0);
    startOfTomorrow.setDate(startOfTomorrow.getDate() + 1);

    const pendingTransactions = await Transaction.find({
      balanceApplied: false,
      isRecurring: { $ne: true },
      date: { $lt: startOfTomorrow },
    });

    for (const tx of pendingTransactions) {
      if (tx.amount === 0) {
        await Transaction.findByIdAndUpdate(tx._id, { balanceApplied: true });
        continue;
      }

      if (tx.type === "transfer" && tx.toAccountId) {
        const [source, dest] = await Promise.all([
          Account.findById(tx.accountId),
          Account.findById(tx.toAccountId),
        ]);
        const isDebtSource = source?.type === "credit_card" || source?.type === "debt";
        const isDebtDest = dest?.type === "credit_card" || dest?.type === "debt";

        await Account.bulkWrite([
          {
            updateOne: {
              filter: { _id: tx.accountId },
              update: { $inc: { balance: isDebtSource ? tx.amount : -tx.amount } },
            },
          },
          {
            updateOne: {
              filter: { _id: tx.toAccountId },
              update: { $inc: { balance: isDebtDest ? -tx.amount : tx.amount } },
            },
          },
        ]);
      } else {
        const acct = await Account.findById(tx.accountId);
        const isDebt = acct?.type === "credit_card" || acct?.type === "debt";
        let balanceChange: number;
        if (isDebt) {
          balanceChange = tx.type === "credit" ? -tx.amount : tx.amount;
        } else {
          balanceChange = tx.type === "credit" ? tx.amount : -tx.amount;
        }

        await Account.findByIdAndUpdate(tx.accountId, {
          $inc: { balance: balanceChange },
        });
      }

      await Transaction.findByIdAndUpdate(tx._id, { balanceApplied: true });
    }

    const accounts = await Account.find(filter).sort({ createdAt: -1 });

    return NextResponse.json(accounts, { status: 200 });
  } catch (error) {
    console.error("GET /api/accounts error:", error);
    return NextResponse.json(
      { error: "Failed to fetch accounts" },
      { status: 500 }
    );
  }
}

// POST /api/accounts — create a new account
export async function POST(request: NextRequest) {
  try {
    await connectDB();

    const body = await request.json();

    const parsed = accountSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { error: "Validation failed", details: parsed.error.flatten() },
        { status: 400 }
      );
    }

    const data = parsed.data;

    // Convert dollar amounts to cents
    const balanceInCents = Math.round(data.balance * 100);

    const accountData: Record<string, unknown> = {
      ...data,
      balance: balanceInCents,
    };

    if (data.creditLimit !== undefined && data.creditLimit !== null) {
      accountData.creditLimit = Math.round(data.creditLimit * 100);
    }


    const account = await Account.create(accountData);

    // Side-effect: loan disbursement
    // If the new account is a debt, is a loan, and has a linked bank account,
    // atomically credit the linked account and record a disbursement transaction.
    if (
      account.type === "debt" &&
      account.isLoan === true &&
      account.linkedAccountId
    ) {
      const linkedAccount = await Account.findById(account.linkedAccountId);

      if (!linkedAccount) {
        return NextResponse.json(
          {
            error: "Linked account not found for loan disbursement",
          },
          { status: 400 }
        );
      }

      // Atomically increment the linked bank account balance by the loan amount
      await Account.findByIdAndUpdate(account.linkedAccountId, {
        $inc: { balance: balanceInCents },
      });

      // Create a disbursement transaction on the linked account
      await Transaction.create({
        accountId: account.linkedAccountId,
        type: "credit",
        amount: balanceInCents,
        description: `Loan disbursement from ${account.name}`,
        categoryTags: ["transfer"],
        date: new Date(),
      });
    }

    return NextResponse.json(account, { status: 201 });
  } catch (error) {
    console.error("POST /api/accounts error:", error);
    return NextResponse.json(
      { error: "Failed to create account" },
      { status: 500 }
    );
  }
}
