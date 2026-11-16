import { NextResponse } from "next/server";
import { connectDB } from "@/lib/db";
import RunLog from "@/models/figure/RunLog";
import { runLogSchema } from "@/lib/figure/validators";
import { isValidObjectId, notFound, serverError, validationError } from "@/lib/figure/api";

type Ctx = { params: Promise<{ runId: string }> };

// PUT /api/figure/runs/:runId
export async function PUT(request: Request, { params }: Ctx) {
  try {
    await connectDB();
    const { runId } = await params;
    if (!isValidObjectId(runId)) return notFound("Run");
    const parsed = runLogSchema.safeParse(await request.json());
    if (!parsed.success) return validationError(parsed.error);

    const { notes, ...rest } = parsed.data;
    const update = notes ? { $set: { ...rest, notes } } : { $set: rest, $unset: { notes: 1 } };
    const updated = await RunLog.findByIdAndUpdate(runId, update, { new: true, runValidators: true });
    if (!updated) return notFound("Run");
    return NextResponse.json(updated, { status: 200 });
  } catch (error) {
    return serverError("PUT /api/figure/runs/[runId]", error, "Failed to update run");
  }
}

// DELETE /api/figure/runs/:runId
export async function DELETE(_request: Request, { params }: Ctx) {
  try {
    await connectDB();
    const { runId } = await params;
    if (!isValidObjectId(runId)) return notFound("Run");
    const deleted = await RunLog.findByIdAndDelete(runId);
    if (!deleted) return notFound("Run");
    return NextResponse.json({ message: "Run deleted" }, { status: 200 });
  } catch (error) {
    return serverError("DELETE /api/figure/runs/[runId]", error, "Failed to delete run");
  }
}
