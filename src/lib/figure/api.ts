import { NextResponse } from "next/server";
import { isValidObjectId } from "mongoose";
import type { ZodError } from "zod";

export function validationError(error: ZodError) {
  return NextResponse.json(
    { error: "Validation failed", details: error.flatten() },
    { status: 400 }
  );
}

export function notFound(what: string) {
  return NextResponse.json({ error: `${what} not found` }, { status: 404 });
}

export function serverError(route: string, error: unknown, message: string) {
  console.error(`${route} error:`, error);
  return NextResponse.json({ error: message }, { status: 500 });
}

export { isValidObjectId };

/** Escape a string for literal use inside a RegExp */
export function escapeRegex(s: string) {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
