import { getDb } from "@/db/client";
import { getAdminFeed } from "@/lib/calendar/service";
import { icsResponse } from "@/lib/calendar/response";

export async function GET(_req: Request, ctx: { params: Promise<{ token: string }> }) {
  const { token } = await ctx.params;
  return icsResponse(await getAdminFeed(await getDb(), token.replace(/\.ics$/, "")));
}
