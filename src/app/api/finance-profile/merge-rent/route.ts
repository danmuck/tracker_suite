import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { connectDB } from "@/lib/db";
import Transaction from "@/models/finance/Transaction";
import { toDateStr } from "@/lib/finance/dates";
import { profileToDollars } from "@/lib/finance/finance-profile";
import { LinkedTransactionMissingError, loadProfile, saveProfileAndApply } from "@/lib/finance/apply-profile";

const mergeSchema = z.object({ keepId: z.string().min(1), mergeId: z.string().min(1) });

// POST /api/finance-profile/merge-rent — fold a second Rent transaction into the
// linked one as a dated rent change, then delete it.
export async function POST(request: NextRequest) {
  try {
    await connectDB();
    const parsed = mergeSchema.safeParse(await request.json());
    if (!parsed.success || parsed.data.keepId === parsed.data.mergeId) {
      return NextResponse.json({ error: "keepId and mergeId must be two different transactions" }, { status: 400 });
    }
    const { keepId, mergeId } = parsed.data;
    const [keep, merge] = await Promise.all([Transaction.findById(keepId), Transaction.findById(mergeId)]);
    if (!keep || !merge || !keep.isRecurring || !merge.isRecurring || !merge.recurrenceRule) {
      return NextResponse.json({ error: "Both transactions must exist and be recurring" }, { status: 404 });
    }

    const profile = await loadProfile();
    const mergeDate = toDateStr(merge.recurrenceRule.startDate);
    const rentSteps = [...profile.rentSteps];
    // Keep the existing amount as the first step if the profile has none yet
    if (rentSteps.length === 0 && keep.recurrenceRule) {
      rentSteps.push({ effectiveDate: toDateStr(keep.recurrenceRule.startDate), monthly: keep.amount });
    }
    if (!rentSteps.some((s) => s.effectiveDate === mergeDate)) {
      rentSteps.push({ effectiveDate: mergeDate, monthly: merge.amount });
    }

    if (keep.recurrenceRule) {
      keep.recurrenceRule.endDate = merge.recurrenceRule.endDate ?? null;
      await keep.save();
    }
    await Transaction.findByIdAndDelete(mergeId);

    const updated = await saveProfileAndApply({ ...profile, rentTransactionId: keepId, rentSteps });
    return NextResponse.json({ data: profileToDollars(await loadProfile()), updated });
  } catch (error) {
    if (error instanceof LinkedTransactionMissingError) {
      return NextResponse.json({ error: error.message }, { status: 409 });
    }
    console.error("POST /api/finance-profile/merge-rent error:", error);
    return NextResponse.json({ error: "Failed to merge rent" }, { status: 500 });
  }
}
