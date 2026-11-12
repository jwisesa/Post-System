import { getDb } from "@/db/client";
import { getViewerFeed } from "@/lib/calendar/service";
import { icsResponse } from "@/lib/calendar/response";

export async function GET(_req: Request, ctx: { params: Promise<{ token: string }> }) {
  const { token } = await ctx.params;
  return icsResponse(await getViewerFeed(await getDb(), token));
}
