// Adapts a RouteDef to a Next route handler backed by MongoDB. Server-only.

import { NextResponse } from "next/server";
import { connectDB } from "@/lib/db";
import { fail, type ApiResult, type Method } from "./api";
import { allRoutes } from "./all-routes";
import { serverGuard } from "./dispatch";
import { mongoStore } from "./mongo-store";
import { ConflictError } from "./store";

type RouteContext = { params: Promise<Record<string, string>> };

async function readBody(request: Request): Promise<unknown> {
  try {
    return await request.json();
  } catch {
    return undefined;
  }
}

export function serve(method: Method, path: string) {
  const route = allRoutes.find((r) => r.method === method && r.path === path);
  if (!route) throw new Error(`No route defined for ${method} ${path}`);

  return async (request: Request, ctx: RouteContext): Promise<Response> => {
    const respond = (result: ApiResult) => NextResponse.json(result.body, { status: result.status });

    const guarded = serverGuard(process.env.NEXT_PUBLIC_DEMO === "1");
    if (guarded) return respond(guarded);

    try {
      await connectDB();
      const body = method === "GET" || method === "DELETE" ? undefined : await readBody(request);
      const params = (await ctx?.params) ?? {};
      const query = new URL(request.url).searchParams;
      return respond(await route.handler({ store: mongoStore, params, query, body, now: new Date() }));
    } catch (error) {
      if (error instanceof ConflictError) return respond(fail(409, "Already exists"));
      console.error(error);
      return respond(fail(500, route.failure ?? "Request failed"));
    }
  };
}
