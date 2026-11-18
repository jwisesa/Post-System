import { getDb } from "@/db/client";
import { getCurrentUser } from "@/lib/auth/session";
import { toCsv } from "@/lib/schedule/csv";
import { today } from "@/lib/schedule/dates";
import { getComparison } from "@/lib/schedule/service";
import { getProjectForUser, InputError } from "@/lib/services";

const KIND = { changed: "Bergeser", added: "Baru", removed: "Hilang", renamed: "Ganti nama", same: "Sama" } as const;

export async function GET(req: Request, ctx: { params: Promise<{ slug: string }> }) {
  const { slug } = await ctx.params;
  const user = await getCurrentUser();
  if (!user) return new Response("Unauthorized", { status: 401 });
  const db = await getDb();
  const row = await getProjectForUser(db, user.id, slug);
  if (!row) return new Response("Not found", { status: 404 });
  const sp = new URL(req.url).searchParams;
  let cmp;
  try { cmp = await getComparison(db, row.project.id, sp.get("a") || "now", sp.get("b") || "now"); } catch (e) {
    if (e instanceof InputError) return new Response(e.message, { status: 400 });
    throw e;
  }
  const rows: string[][] = [["Track", "Tipe", "Nama", "Nama lama", "Perubahan", "Mulai lama", "Selesai lama", "Mulai baru", "Selesai baru", "Selisih mulai (hk)", "Selisih selesai (hk)"]];
  for (const r of cmp.rows) {
    const both = r.old && r.now;
    rows.push([r.track, r.parent ? "Milestone" : "Fase", r.name, r.oldName ?? "", KIND[r.kind], r.old?.start ?? "", r.old?.due ?? "", r.now?.start ?? "", r.now?.due ?? "", both ? String(r.dStart) : "", both ? String(r.dDue) : ""]);
  }
  return new Response("﻿" + toCsv(rows), {
    headers: { "Content-Type": "text/csv; charset=utf-8", "Content-Disposition": `attachment; filename="${slug}-perbandingan-${today()}.csv"` },
  });
}
