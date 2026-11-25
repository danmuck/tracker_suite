import { NextResponse, type NextRequest } from "next/server";
import { demoApiGuard } from "@/lib/data/dispatch";
import { HOST_REFUSED, hostAllowed } from "@/lib/edgectl/server/guard";

// In the demo build no API route may run: all data lives in the visitor's browser.
export function proxy(request: NextRequest) {
  const refusal = demoApiGuard(request.nextUrl.pathname, process.env.NEXT_PUBLIC_DEMO === "1");
  if (refusal) return NextResponse.json(refusal.body, { status: refusal.status });
  // edgectl routes act as the operator: answer only under a host name this app is served on,
  // so a website that points its own domain at this machine can neither read nor change anything.
  const path = request.nextUrl.pathname;
  if ((path === "/api/edgectl" || path.startsWith("/api/edgectl/")) && !hostAllowed(request.headers.get("host"))) {
    return NextResponse.json({ error: HOST_REFUSED }, { status: 403 });
  }
  return NextResponse.next();
}

export const config = { matcher: ["/api", "/api/:path*"] };
