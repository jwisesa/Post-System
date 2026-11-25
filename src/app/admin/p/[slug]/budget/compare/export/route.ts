import { getDb } from "@/db/client";
import { can } from "@/lib/auth/permissions";
import { getCurrentUser } from "@/lib/auth/session";
import { compareVersions } from "@/lib/budget/compare";
import { csvText } from "@/lib/budget/export";
import { toCsv } from "@/lib/schedule/csv";
import { today } from "@/lib/schedule/dates";
import { getProjectForUser, InputError } from "@/lib/services";

const KIND = { changed: "Berubah", added: "Baru", removed: "Hilang", same: "Sama" } as const;
const q = (n?: number) => (n == null ? "" : String(n / 1000).replace(".", ","));

export async function GET(req: Request, ctx: { params: Promise<{ slug: string }> }) {
  const { slug } = await ctx.params;
  const user = await getCurrentUser();
  if (!user) return new Response("Unauthorized", { status: 401 });
  const db = await getDb();
  const row = await getProjectForUser(db, user.id, slug);
  if (!row) return new Response("Not found", { status: 404 });
  if (!can(row.role, "budget.view")) return new Response("Forbidden", { status: 403 });
  const sp = new URL(req.url).searchParams;
  let c;
  try { c = await compareVersions(db, user.id, row.project.id, sp.get("a") ?? "", sp.get("b") ?? ""); } catch (e) {
    if (e instanceof InputError) return new Response(e.message, { status: 400 });
    throw e;
  }
  const rows: string[][] = [["Item", "Status", "Jumlah lama", "Jumlah baru", "Harga lama (Rp)", "Harga baru (Rp)", "Jumlah lama (Rp)", "Jumlah baru (Rp)", "Selisih (Rp)"]];
  for (const r of c.diff.rows) rows.push([csvText(r.item), KIND[r.kind], q(r.a?.qtyMilli), q(r.b?.qtyMilli), String(r.a?.unitPrice ?? ""), String(r.b?.unitPrice ?? ""), String(r.a?.amount ?? ""), String(r.b?.amount ?? ""), String(r.delta)]);
  const t = (l: string, x: number, y: number) => ["", l, "", "", "", "", String(x), String(y), String(y - x)];
  rows.push(t("Subtotal", c.a.subtotal, c.b.subtotal), t("PPN (perkiraan)", c.a.ppn, c.b.ppn), t("PPh 23 (perkiraan)", c.a.pph23, c.b.pph23), t("Net (perkiraan)", c.a.subtotal + c.a.ppn - c.a.pph23, c.b.subtotal + c.b.ppn - c.b.pph23));
  return new Response("﻿" + toCsv(rows), {
    headers: { "Content-Type": "text/csv; charset=utf-8", "Content-Disposition": `attachment; filename="${slug}-bandingkan-anggaran-${today()}.csv"` },
  });
}
