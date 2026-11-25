import { NextResponse } from "next/server";
import { MirageError, mirageRequest } from "@/lib/edgectl/server/client";
import { statusSchema } from "@/lib/edgectl/validators";
import type { ConnectionState } from "@/types/edgectl/api";

// Always 200: whether Mirage can be reached is the answer, not a failure of this route.
export async function GET() {
  let state: ConnectionState;
  try {
    state = { state: "ok", status: await mirageRequest("GET", ["status"], { schema: statusSchema, timeoutMs: 5_000 }) };
  } catch (error) {
    if (error instanceof MirageError && (error.kind === "not_configured" || error.kind === "unreachable")) {
      state = { state: error.kind, message: error.message };
    } else if (error instanceof MirageError) {
      state = { state: "error", message: error.message };
    } else {
      console.error("edgectl status error:", error);
      state = { state: "error", message: "Request failed" };
    }
  }
  return NextResponse.json(state);
}
