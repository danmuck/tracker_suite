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

/**
 * Mongo update for a full-replace PUT: sets every provided field and
 * removes each optional field that was left out, so clearing a field sticks.
 */
export function setAndUnset<T extends Record<string, unknown>>(data: T, optionalKeys: readonly string[]) {
  const $set: Record<string, unknown> = {};
  const $unset: Record<string, 1> = {};
  for (const [key, value] of Object.entries(data)) {
    if (value !== undefined && value !== "") $set[key] = value;
  }
  for (const key of optionalKeys) {
    if (!(key in $set)) $unset[key] = 1;
  }
  return Object.keys($unset).length ? { $set, $unset } : { $set };
}
