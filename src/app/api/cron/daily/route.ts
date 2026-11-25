import { getDb } from "@/db/client";
import { authorized, runDaily } from "@/lib/push/service";
import { today } from "@/lib/schedule/dates";

export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  if (!authorized(req.headers.get("authorization"))) return new Response("Unauthorized", { status: 401 });
  return Response.json({ created: await runDaily(await getDb(), today()) });
}
