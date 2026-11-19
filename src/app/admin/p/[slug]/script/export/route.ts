import { getDb } from "@/db/client";
import { getCurrentUser } from "@/lib/auth/session";
import { toCsv } from "@/lib/schedule/csv";
import { today } from "@/lib/schedule/dates";
import { postCsvRows } from "@/lib/script/needs";
import { getScript, listPhases } from "@/lib/script/service";
import { fmtDuration, fmtPage } from "@/lib/script/types";
import { getProjectForUser } from "@/lib/services";

export async function GET(req: Request, ctx: { params: Promise<{ slug: string }> }) {
  const { slug } = await ctx.params;
  const user = await getCurrentUser();
  if (!user) return new Response("Unauthorized", { status: 401 });
  const db = await getDb();
  const row = await getProjectForUser(db, user.id, slug);
  if (!row) return new Response("Not found", { status: 404 });
  const q = new URL(req.url).searchParams;
  const data = await getScript(db, row.project.id, q.get("script") ?? "");
  if (!data) return new Response("Not found", { status: 404 });
  const { scenes, aggregate: agg } = data;
  const type = q.get("type");
  let rows: string[][];
  if (type === "characters") {
    rows = [["Tokoh", "Jumlah adegan", "Blok dialog", "Nomor adegan"], ...agg.characters.map((c) => [c.name, String(c.scenes), String(c.blocks), c.sceneNumbers.join(" ")])];
  } else if (type === "locations") {
    rows = [["Lokasi", "Jumlah adegan", "Perkiraan durasi", "Detik", "Nomor adegan"], ...agg.locations.map((l) => [l.place, String(l.scenes), fmtDuration(l.seconds), String(l.seconds), l.sceneNumbers.join(" ")])];
  } else if (type === "scenes") {
    rows = [
      ["No", "Judul adegan", "INT/EXT", "Lokasi", "Waktu", "Halaman mulai", "Halaman selesai", "Perkiraan durasi", "Detik", "Tokoh", "Catatan"],
      ...scenes.map((s) => [s.number, s.heading, s.intExt, s.location, s.timeOfDay, fmtPage(s.pageStart), fmtPage(s.pageEnd), fmtDuration(s.estSeconds), String(s.estSeconds), s.characters.map((c) => c.name).join("; "), s.notes]),
    ];
  } else if (type === "post") {
    rows = postCsvRows(scenes, await listPhases(db, row.project.id));
  } else return new Response("Bad request", { status: 400 });
  const base = data.script.title.replace(/[^\w\- ]+/g, "").trim().replace(/\s+/g, "-") || "naskah";
  return new Response("﻿" + toCsv(rows), {
    headers: { "Content-Type": "text/csv; charset=utf-8", "Content-Disposition": `attachment; filename="${slug}-${base}-${type}-${today()}.csv"` },
  });
}
