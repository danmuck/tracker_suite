import { serve } from "@/lib/data/serve";

export const GET = serve("GET", "/api/link-groups/:groupId");
export const PUT = serve("PUT", "/api/link-groups/:groupId");
export const DELETE = serve("DELETE", "/api/link-groups/:groupId");
