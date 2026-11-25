import { NextResponse } from "next/server";
import { capabilities } from "@/lib/edgectl/server/edgecert";

// Which features that need server configuration (edgecert, issuing key, second operator) are usable.
// Reads the environment only; never calls Mirage.
export async function GET() {
  return NextResponse.json(await capabilities());
}
