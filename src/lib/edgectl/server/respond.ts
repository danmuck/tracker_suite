// Turns a Mirage call into this app's route response. Server-only.

import { NextResponse } from "next/server";
import type { ZodError } from "zod";
import { failureOf, MirageError } from "./client";
import { crossSiteProblem } from "./guard";

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

/**
 * For every route that changes something in Mirage: the refusal for a request that did not come
 * from this app's own pages (403) or whose body is not declared as JSON (415), else null.
 */
export function refuseCrossSite(request: Request, options: { body: boolean }): NextResponse | null {
  const problem = crossSiteProblem(request.headers, options);
  if (problem === null) return null;
  const status = problem.startsWith("Content-Type") ? 415 : 403;
  return NextResponse.json({ error: problem }, { status });
}

export async function readJson(request: Request): Promise<unknown> {
  try {
    return await request.json();
  } catch {
    return undefined;
  }
}
