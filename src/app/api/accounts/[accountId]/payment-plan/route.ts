import { NextRequest, NextResponse } from "next/server";
import { connectDB } from "@/lib/db";
import { paymentPlanSetupSchema, paymentPlanUpdateSchema } from "@/lib/finance/validators";
import {
  PaymentPlanError,
  getPaymentPlan,
  setupPayments,
  unlinkPaymentPlan,
  updatePaymentPlan,
} from "@/lib/finance/payment-plan";

type Ctx = { params: Promise<{ accountId: string }> };

function errorResponse(error: unknown, action: string) {
  if (error instanceof PaymentPlanError) {
    return NextResponse.json({ error: error.message }, { status: error.status });
  }
  console.error(`${action} /api/accounts/[accountId]/payment-plan error:`, error);
  return NextResponse.json({ error: "Failed to update payment plan" }, { status: 500 });
}

function validationError(issues: { message: string }[]) {
  return NextResponse.json({ error: issues[0]?.message ?? "Validation failed" }, { status: 400 });
}

// GET — plan fields, linked payment, schedule, next RAP payment and payoff estimate
export async function GET(_request: NextRequest, { params }: Ctx) {
  try {
    await connectDB();
    const { accountId } = await params;
    return NextResponse.json({ data: await getPaymentPlan(accountId) });
  } catch (error) {
    return errorResponse(error, "GET");
  }
}

// POST — create the monthly bank → account payment transfer and link it
export async function POST(request: NextRequest, { params }: Ctx) {
  try {
    await connectDB();
    const { accountId } = await params;
    const parsed = paymentPlanSetupSchema.safeParse(await request.json());
    if (!parsed.success) return validationError(parsed.error.issues);
    await setupPayments(accountId, parsed.data);
    return NextResponse.json({ data: await getPaymentPlan(accountId) });
  } catch (error) {
    return errorResponse(error, "POST");
  }
}

// PUT — replace manual schedule entries, sub-loans, and/or RAP settings
export async function PUT(request: NextRequest, { params }: Ctx) {
  try {
    await connectDB();
    const { accountId } = await params;
    const parsed = paymentPlanUpdateSchema.safeParse(await request.json());
    if (!parsed.success) return validationError(parsed.error.issues);
    await updatePaymentPlan(accountId, parsed.data);
    return NextResponse.json({ data: await getPaymentPlan(accountId) });
  } catch (error) {
    return errorResponse(error, "PUT");
  }
}

// DELETE — unlink the payment transfer (the transfer itself is kept)
export async function DELETE(_request: NextRequest, { params }: Ctx) {
  try {
    await connectDB();
    const { accountId } = await params;
    await unlinkPaymentPlan(accountId);
    return NextResponse.json({ data: await getPaymentPlan(accountId) });
  } catch (error) {
    return errorResponse(error, "DELETE");
  }
}
