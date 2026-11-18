import { getDb } from "@/db/client";
import { getCurrentUser } from "@/lib/auth/session";
import { MARKER_FORMATS } from "@/lib/feedback/markers";
import { listPoints } from "@/lib/feedback/service";
import { getSchedule } from "@/lib/schedule/service";
import { getProjectForUser } from "@/lib/services";
import { RATES, tcToFrames } from "@/lib/timecode";

/** GET ?item=&format=&rate=&start=&mode=&open=1 : one milestone's feedback as a marker file. */
export async function GET(req: Request, ctx: { params: Promise<{ slug: string }> }) {
  const { slug } = await ctx.params;
  const user = await getCurrentUser();
  if (!user) return new Response("Unauthorized", { status: 401 });
  const db = await getDb();
  const row = await getProjectForUser(db, user.id, slug);
  if (!row) return new Response("Not found", { status: 404 });

  const q = new URL(req.url).searchParams;
  const fmt = MARKER_FORMATS.find((f) => f.id === q.get("format"));
  const rate = RATES.find((r) => r.id === q.get("rate"))?.rate;
  const start = q.get("start") ?? "";
  const mode = q.get("mode");
  if (!fmt) return new Response("Format tidak dikenal.", { status: 400 });
  if (!rate) return new Response("Frame rate wajib dipilih.", { status: 400 });
  if (tcToFrames(start, rate) === null) return new Response("Start timecode tidak valid untuk frame rate ini.", { status: 400 });
  if (mode !== "offset" && mode !== "absolute") return new Response("Mode wajib dipilih.", { status: 400 });

  const [sched, points] = await Promise.all([getSchedule(db, row.project.id, { includeInternal: true }), listPoints(db, row.project.id, { includeInternal: true })]);
  const item = sched.tracks.flatMap((t) => t.items).find((i) => i.id === q.get("item"));
  if (!item) return new Response("Item tidak ditemukan.", { status: 404 });
  const mine = points.filter((p) => p.itemId === item.id && (q.get("open") !== "1" || p.status === "open"));
  const { text, skipped } = fmt.make(mine, { rate, start, mode, name: item.name });
  return new Response((fmt.bom ? "﻿" : "") + text, {
    headers: {
      "Content-Type": `${fmt.mime}; charset=utf-8`,
      "Content-Disposition": `attachment; filename="${slug}-marker-${fmt.id}.${fmt.ext}"`,
      "X-Skipped": String(skipped),
    },
  });
}
