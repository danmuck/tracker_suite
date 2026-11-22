import { NextResponse, type NextRequest } from "next/server";
import { isModulePath } from "@/config/modules";
import { modulesEnabled } from "@/lib/suite-mode";

/**
 * In public mode every module route answers 404, as if it did not exist.
 * This is the outer gate; the suite layout and the database layer check the
 * mode again on their own.
 */
export function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl;
  if (modulesEnabled() || !isModulePath(pathname)) return NextResponse.next();

  if (pathname.startsWith("/api/")) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }
  // Rewrite to a path no route matches so the branded 404 page renders.
  return NextResponse.rewrite(new URL("/_gated", request.url), { status: 404 });
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|icon.svg).*)"],
};
