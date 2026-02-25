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
      filter.accountId = accountId;
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

    const transaction = await Transaction.create({
      ...validated,
      amount: amountInCents,
    });

    if (!validated.isRecurring) {
      const balanceChange =
        validated.type === "credit" ? amountInCents : -amountInCents;

      await Account.findByIdAndUpdate(validated.accountId, {
        $inc: { balance: balanceChange },
      });
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
