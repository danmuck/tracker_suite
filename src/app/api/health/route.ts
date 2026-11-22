import { NextResponse } from "next/server";
import mongoose from "mongoose";
import { connectDB } from "@/lib/db";
import { modules } from "@/config/modules";
import { modulesEnabled } from "@/lib/suite-mode";

export const dynamic = "force-dynamic";

/**
 * Liveness for the site, plus readiness of the module backends in local
 * mode. Public mode reports nothing beyond "the process is up".
 */
export async function GET() {
  if (!modulesEnabled()) {
    return NextResponse.json({ status: "ok", mode: "public" });
  }

  const startedAt = performance.now();
  let db: { ok: true; latencyMs: number } | { ok: false; error: string };
  try {
    await connectDB();
    await mongoose.connection.db?.admin().ping();
    db = { ok: true, latencyMs: Math.round(performance.now() - startedAt) };
  } catch (err) {
    db = { ok: false, error: err instanceof Error ? err.message : "Unknown error" };
  }

  return NextResponse.json(
    {
      status: db.ok ? "ok" : "degraded",
      mode: "local",
      uptimeSeconds: Math.round(process.uptime()),
      modules: modules.map((m) => m.id),
      db,
    },
    { status: db.ok ? 200 : 503 }
  );
}
