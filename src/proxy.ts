import { NextResponse, type NextRequest } from "next/server";
import { demoApiGuard } from "@/lib/data/dispatch";

// In the demo build no API route may run: all data lives in the visitor's browser.
export function proxy(request: NextRequest) {
  const refusal = demoApiGuard(request.nextUrl.pathname, process.env.NEXT_PUBLIC_DEMO === "1");
  if (!refusal) return NextResponse.next();
  return NextResponse.json(refusal.body, { status: refusal.status });
}

export const config = { matcher: ["/api", "/api/:path*"] };
