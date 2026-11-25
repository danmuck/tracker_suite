import { mirageRequest } from "@/lib/edgectl/server/client";
import { forward, invalid } from "@/lib/edgectl/server/respond";
import { activityKindSchema, activitySchema, reportLimitSchema } from "@/lib/edgectl/validators";

// Mirage's recent audit and custody records (in memory, oldest first, empty after a Mirage restart).
export async function GET(request: Request) {
  const params = new URL(request.url).searchParams;
  const rawLimit = params.get("limit");
  const limit = rawLimit === null ? undefined : reportLimitSchema.safeParse(rawLimit);
  if (limit && !limit.success) return invalid(limit.error);
  const rawKind = params.get("kind");
  const kind = rawKind === null ? undefined : activityKindSchema.safeParse(rawKind);
  if (kind && !kind.success) return invalid(kind.error);
  return forward(() =>
    mirageRequest("GET", ["activity"], { query: { limit: limit?.data, kind: kind?.data }, schema: activitySchema }),
  );
}
