import { getDb } from "@/db/client";
import { getCurrentUser } from "@/lib/auth/session";
import { listUnread } from "@/lib/push/service";

export const dynamic = "force-dynamic";

export async function GET() {
  const user = await getCurrentUser();
  if (!user) return Response.json({ error: "unauthorized" }, { status: 401 });
  return Response.json({ notifications: await listUnread(await getDb(), user.id) }, { headers: { "Cache-Control": "no-store" } });
}
