import { NextResponse } from "next/server";
import { connectDB } from "@/lib/db";
import FutureSettings, { SETTINGS_KEY } from "@/models/future/FutureSettings";
import { settingsSchema } from "@/lib/future/validators";
import { serverError, setAndUnset, validationError } from "@/lib/api-helpers";

const shape = (doc: { annualSalary?: number; commuteDestination?: string } | null) => ({
  annualSalary: doc?.annualSalary,
  commuteDestination: doc?.commuteDestination,
});

export async function GET() {
  try {
    await connectDB();
    const doc = await FutureSettings.findOne({ key: SETTINGS_KEY }).lean();
    return NextResponse.json(shape(doc), { status: 200 });
  } catch (error) {
    return serverError("GET /api/future/settings", error, "Failed to fetch settings");
  }
}

/** Full replace: a field left out of the body is cleared */
export async function PUT(request: Request) {
  try {
    await connectDB();
    const parsed = settingsSchema.safeParse(await request.json());
    if (!parsed.success) return validationError(parsed.error);
    const doc = await FutureSettings.findOneAndUpdate(
      { key: SETTINGS_KEY },
      setAndUnset(parsed.data, ["annualSalary", "commuteDestination"]),
      { new: true, upsert: true, runValidators: true }
    ).lean();
    return NextResponse.json(shape(doc), { status: 200 });
  } catch (error) {
    return serverError("PUT /api/future/settings", error, "Failed to save settings");
  }
}
