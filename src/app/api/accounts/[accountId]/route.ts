import { NextRequest, NextResponse } from "next/server";
import { connectDB } from "@/lib/db";
import Account from "@/models/finance/Account";
import Transaction from "@/models/finance/Transaction";
import { accountSchema } from "@/lib/finance/validators";

// GET /api/accounts/:accountId — fetch a single account
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ accountId: string }> }
) {
  try {
    await connectDB();

    const { accountId } = await params;

    const account = await Account.findById(accountId);

    if (!account) {
      return NextResponse.json(
        { error: "Account not found" },
        { status: 404 }
      );
    }

    return NextResponse.json(account, { status: 200 });
  } catch (error) {
    console.error(`GET /api/accounts/[accountId] error:`, error);
    return NextResponse.json(
      { error: "Failed to fetch account" },
      { status: 500 }
    );
  }
}

// PUT /api/accounts/:accountId — update an account
export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ accountId: string }> }
) {
  try {
    await connectDB();

    const { accountId } = await params;

    const existingAccount = await Account.findById(accountId);
    if (!existingAccount) {
      return NextResponse.json(
        { error: "Account not found" },
        { status: 404 }
      );
    }

    const body = await request.json();

    // Prevent changing the type of the Cash account
    if (existingAccount.isCash && body.type && body.type !== "bank") {
      return NextResponse.json(
        { error: "Cannot change the type of the Cash account" },
        { status: 400 }
      );
    }

    const parsed = accountSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { error: "Validation failed", details: parsed.error.flatten() },
        { status: 400 }
      );
    }

    const data = parsed.data;

    // Convert dollar amounts to cents
    const updateData: Record<string, unknown> = {
      ...data,
      balance: Math.round(data.balance * 100),
    };

    if (data.creditLimit !== undefined && data.creditLimit !== null) {
      updateData.creditLimit = Math.round(data.creditLimit * 100);
    }


    const updatedAccount = await Account.findByIdAndUpdate(
      accountId,
      updateData,
      { new: true, runValidators: true }
    );

    return NextResponse.json(updatedAccount, { status: 200 });
  } catch (error) {
    console.error(`PUT /api/accounts/[accountId] error:`, error);
    return NextResponse.json(
      { error: "Failed to update account" },
      { status: 500 }
    );
  }
}

// DELETE /api/accounts/:accountId — delete an account and its transactions
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ accountId: string }> }
) {
  try {
    await connectDB();

    const { accountId } = await params;

    const account = await Account.findById(accountId);
    if (!account) {
      return NextResponse.json(
        { error: "Account not found" },
        { status: 404 }
      );
    }

    if (account.isCash) {
      return NextResponse.json(
        { error: "The Cash account cannot be deleted" },
        { status: 403 }
      );
    }

    // Delete all transactions associated with this account
    await Transaction.deleteMany({ accountId });

    // Delete the account itself
    await Account.findByIdAndDelete(accountId);

    return NextResponse.json(
      { message: "Account and associated transactions deleted" },
      { status: 200 }
    );
  } catch (error) {
    console.error(`DELETE /api/accounts/[accountId] error:`, error);
    return NextResponse.json(
      { error: "Failed to delete account" },
      { status: 500 }
    );
  }
}
