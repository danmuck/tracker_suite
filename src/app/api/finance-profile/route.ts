import { NextRequest, NextResponse } from "next/server";
import { connectDB } from "@/lib/db";
import { financeProfileSchema } from "@/lib/finance/validators";
import { profileFromDollars, profileToDollars } from "@/lib/finance/finance-profile";
import { LinkedTransactionMissingError, loadProfile, saveProfileAndApply } from "@/lib/finance/apply-profile";

// GET /api/finance-profile — the Datasheet profile (money in dollars)
export async function GET() {
  try {
    await connectDB();
    return NextResponse.json({ data: profileToDollars(await loadProfile()) });
  } catch (error) {
    console.error("GET /api/finance-profile error:", error);
    return NextResponse.json({ error: "Failed to load profile" }, { status: 500 });
  }
}

// PUT /api/finance-profile — save and write Salary/Rent amount schedules
export async function PUT(request: NextRequest) {
  try {
    await connectDB();
    const parsed = financeProfileSchema.safeParse(await request.json());
    if (!parsed.success) {
      const first = parsed.error.issues[0];
      return NextResponse.json(
        { error: first?.message ?? "Validation failed", details: parsed.error.flatten() },
        { status: 400 }
      );
    }
    const updated = await saveProfileAndApply(profileFromDollars(parsed.data));
    return NextResponse.json({ data: profileToDollars(await loadProfile()), updated });
  } catch (error) {
    if (error instanceof LinkedTransactionMissingError) {
      return NextResponse.json({ error: error.message }, { status: 409 });
    }
    console.error("PUT /api/finance-profile error:", error);
    return NextResponse.json({ error: "Failed to save profile" }, { status: 500 });
  }
}
