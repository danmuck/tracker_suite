// Turns a Mirage call into this app's route response. Server-only.

import { NextResponse } from "next/server";
import type { ZodError } from "zod";
import { failureOf, MirageError } from "./client";

/** Runs a Mirage call and answers with its data, or with the failure for its error */
export async function forward<T>(run: () => Promise<T>): Promise<NextResponse> {
  try {
    return NextResponse.json(await run());
  } catch (error) {
    if (!(error instanceof MirageError)) console.error("edgectl route error:", error);
    const failure = failureOf(error);
    return NextResponse.json(failure.body, { status: failure.status });
  }
}

export function invalid(error: ZodError): NextResponse {
  const first = error.issues[0];
  return NextResponse.json(
    { error: first ? first.message : "Validation failed", details: error.flatten() },
    { status: 400 },
  );
}

export async function readJson(request: Request): Promise<unknown> {
  try {
    return await request.json();
  } catch {
    return undefined;
  }
}
