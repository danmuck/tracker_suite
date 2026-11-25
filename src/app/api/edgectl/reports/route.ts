import { mirageRequest } from "@/lib/edgectl/server/client";
import { forward, invalid } from "@/lib/edgectl/server/respond";
import { reportLimitSchema, reportsSchema } from "@/lib/edgectl/validators";

export async function GET(request: Request) {
  const raw = new URL(request.url).searchParams.get("limit");
  const limit = raw === null ? undefined : reportLimitSchema.safeParse(raw);
  if (limit && !limit.success) return invalid(limit.error);
  return forward(() => mirageRequest("GET", ["reports"], { query: { limit: limit?.data }, schema: reportsSchema }));
}
