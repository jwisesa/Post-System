import { z } from "zod";
import { getDb } from "@/db/client";
import { getCurrentUser } from "@/lib/auth/session";
import { isPushEndpoint, subscribe, unsubscribe } from "@/lib/push/service";

const Sub = z.object({ endpoint: z.url().max(1000).refine(isPushEndpoint), keys: z.object({ p256dh: z.string().min(1).max(200), auth: z.string().min(1).max(100) }) });
const Del = z.object({ endpoint: z.string().max(1000) });

export async function POST(req: Request) {
  const user = await getCurrentUser();
  if (!user) return Response.json({ error: "unauthorized" }, { status: 401 });
  const p = Sub.safeParse(await req.json().catch(() => null));
  if (!p.success) return Response.json({ error: "invalid" }, { status: 400 });
  await subscribe(await getDb(), user.id, { ...p.data, userAgent: req.headers.get("user-agent") ?? "" });
  return Response.json({ ok: true });
}

export async function DELETE(req: Request) {
  const user = await getCurrentUser();
  if (!user) return Response.json({ error: "unauthorized" }, { status: 401 });
  const p = Del.safeParse(await req.json().catch(() => null));
  if (!p.success) return Response.json({ error: "invalid" }, { status: 400 });
  await unsubscribe(await getDb(), user.id, p.data.endpoint);
  return Response.json({ ok: true });
}
