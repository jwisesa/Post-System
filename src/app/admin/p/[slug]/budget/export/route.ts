import { getDb } from "@/db/client";
import { getCurrentUser } from "@/lib/auth/session";
import { authorizeBudgetExport, budgetCsvRows, EXPORT_TYPES, type ExportType } from "@/lib/budget/export";
import { InputError } from "@/lib/services";
import { toCsv } from "@/lib/schedule/csv";
import { today } from "@/lib/schedule/dates";

export async function GET(req: Request, ctx: { params: Promise<{ slug: string }> }) {
  const { slug } = await ctx.params;
  const db = await getDb();
  const a = await authorizeBudgetExport(db, await getCurrentUser(), slug);
  if (!a.ok) return new Response(a.message, { status: a.status });
  const type = new URL(req.url).searchParams.get("type") ?? "";
  if (!(EXPORT_TYPES as readonly string[]).includes(type)) return new Response("Bad request", { status: 400 });
  const scope = new URL(req.url).searchParams.get("scope");
  let rows: string[][];
  try { rows = await budgetCsvRows(db, a.userId, a.projectId, type as ExportType, type === "versions" || type === "lines" ? scope : null); } catch (e) { if (e instanceof InputError) return new Response("Bad request", { status: 400 }); throw e; }
  return new Response("﻿" + toCsv(rows), {
    headers: { "Content-Type": "text/csv; charset=utf-8", "Content-Disposition": `attachment; filename="${slug}-anggaran-${type}-${today()}.csv"` },
  });
}
