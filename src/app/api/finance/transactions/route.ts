import { NextRequest, NextResponse } from "next/server";
import { connectDB } from "@/lib/db";
import Transaction from "@/models/Transaction";
import Account from "@/models/Account";
import { transactionSchema } from "@/lib/validators";

export async function GET(request: NextRequest) {
  try {
    await connectDB();

    const searchParams = request.nextUrl.searchParams;

    const accountId = searchParams.get("accountId");
    const startDate = searchParams.get("startDate");
    const endDate = searchParams.get("endDate");
    const type = searchParams.get("type");
    const category = searchParams.get("category");
    const isRecurring = searchParams.get("isRecurring");
    const search = searchParams.get("search");
    const page = parseInt(searchParams.get("page") || "1", 10);
    const limit = parseInt(searchParams.get("limit") || "20", 10);
    const sort = searchParams.get("sort") || "date";
    const order = searchParams.get("order") || "desc";

    const filter: Record<string, unknown> = {};

    if (accountId) {
      filter.$or = [{ accountId }, { toAccountId: accountId }];
    }

    if (startDate || endDate) {
      filter.date = {};
      if (startDate) {
        (filter.date as Record<string, unknown>).$gte = new Date(startDate);
      }
      if (endDate) {
        (filter.date as Record<string, unknown>).$lte = new Date(endDate);
      }
    }

    if (type) {
      filter.type = type;
    }

    if (category) {
      filter.categoryTags = category;
    }

    if (isRecurring) {
      filter.isRecurring = isRecurring === "true";
    }

    if (search) {
      filter.description = { $regex: search, $options: "i" };
    }

    const skip = (page - 1) * limit;
    const sortOrder = order === "asc" ? 1 : -1;

    const [data, total] = await Promise.all([
      Transaction.find(filter)
        .sort({ [sort]: sortOrder })
        .skip(skip)
        .limit(limit)
        .lean(),
      Transaction.countDocuments(filter),
    ]);

    const totalPages = Math.ceil(total / limit);

    return NextResponse.json({
      data,
      pagination: {
        page,
        limit,
        total,
        totalPages,
      },
    });
  } catch (error) {
    console.error("Error fetching transactions:", error);
    return NextResponse.json(
      { error: "Failed to fetch transactions" },
      { status: 500 }
    );
  }
}

export async function POST(request: NextRequest) {
  try {
    await connectDB();

    const body = await request.json();
    const validated = transactionSchema.parse(body);

    const amountInCents = Math.round(validated.amount * 100);

    let finalAmountInCents = amountInCents;
    let sourceAccount = null;
    let destAccount = null;

    if (validated.type === "transfer") {
      [sourceAccount, destAccount] = await Promise.all([
        Account.findById(validated.accountId),
        Account.findById(validated.toAccountId),
      ]);

      if (!sourceAccount || !destAccount) {
        return NextResponse.json(
          { error: "Source or destination account not found" },
          { status: 400 }
        );
      }

      if (!validated.isRecurring) {
        // Credit limit cap: if source is credit_card with creditLimit
        // Positive balance = amount owed, so available = creditLimit - balance
        if (sourceAccount.type === "credit_card" && sourceAccount.creditLimit) {
          const availableCredit = sourceAccount.creditLimit - sourceAccount.balance;
          if (availableCredit <= 0) {
            finalAmountInCents = 0;
          } else {
            finalAmountInCents = Math.min(finalAmountInCents, availableCredit);
          }
        }

        // Debt cap: if destination is credit_card/debt, cap at remaining owed
        // Positive balance = amount owed
        if (destAccount.type === "credit_card" || destAccount.type === "debt") {
          const owed = destAccount.balance;
          if (owed <= 0) {
            finalAmountInCents = 0;
          } else {
            finalAmountInCents = Math.min(finalAmountInCents, owed);
          }
        }
      }
    }

    // Determine if this transaction's date is in the future
    const txDate = new Date(validated.date);
    const startOfTomorrow = new Date();
    startOfTomorrow.setHours(0, 0, 0, 0);
    startOfTomorrow.setDate(startOfTomorrow.getDate() + 1);
    const isFuture = txDate >= startOfTomorrow;

    const transaction = await Transaction.create({
      ...validated,
      amount: finalAmountInCents,
      balanceApplied: !isFuture && !validated.isRecurring,
    });

    // Only apply balance changes for non-recurring, non-future transactions
    if (!validated.isRecurring && !isFuture) {
      if (validated.type === "transfer") {
        if (finalAmountInCents > 0) {
          const isDebtSource = sourceAccount?.type === "credit_card" || sourceAccount?.type === "debt";
          const isDebtDest = destAccount?.type === "credit_card" || destAccount?.type === "debt";

          await Account.bulkWrite([
            {
              updateOne: {
                filter: { _id: validated.accountId },
                // Debt/CC source: paying from credit increases what's owed (+)
                // Bank source: decreases balance (-)
                update: { $inc: { balance: isDebtSource ? finalAmountInCents : -finalAmountInCents } },
              },
            },
            {
              updateOne: {
                filter: { _id: validated.toAccountId },
                // Debt/CC dest: payment reduces what's owed (-)
                // Bank dest: increases balance (+)
                update: { $inc: { balance: isDebtDest ? -finalAmountInCents : finalAmountInCents } },
              },
            },
          ]);
        }
      } else {
        const account = await Account.findById(validated.accountId);
        const isDebt = account?.type === "credit_card" || account?.type === "debt";
        // For debt/CC: credit (payment) decreases balance, debit (charge) increases balance
        // For bank: credit increases, debit decreases
        let balanceChange: number;
        if (isDebt) {
          balanceChange = validated.type === "credit" ? -finalAmountInCents : finalAmountInCents;
        } else {
          balanceChange = validated.type === "credit" ? finalAmountInCents : -finalAmountInCents;
        }

        await Account.findByIdAndUpdate(validated.accountId, {
          $inc: { balance: balanceChange },
        });
      }
    }

    return NextResponse.json(transaction, { status: 201 });
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
    console.error("Error creating transaction:", error);
    return NextResponse.json(
      { error: "Failed to create transaction" },
      { status: 500 }
    );
  }
}
