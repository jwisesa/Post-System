import { getDb } from "@/db/client";
import { getCurrentUser } from "@/lib/auth/session";
import { toCsv } from "@/lib/schedule/csv";
import { today } from "@/lib/schedule/dates";
import { getSchedule } from "@/lib/schedule/service";
import { statusLabel } from "@/lib/schedule/templates";
import { calendarDays, calOf, workDays } from "@/lib/schedule/workdays";
import { getProjectForUser } from "@/lib/services";

export async function GET(_req: Request, ctx: { params: Promise<{ slug: string }> }) {
  const { slug } = await ctx.params;
  const user = await getCurrentUser();
  if (!user) return new Response("Unauthorized", { status: 401 });
  const db = await getDb();
  const row = await getProjectForUser(db, user.id, slug);
  if (!row) return new Response("Not found", { status: 404 });

  const { tracks, deps, settings } = await getSchedule(db, row.project.id, { includeInternal: true });
  const cal = calOf(settings);
  const all = tracks.flatMap((t) => t.items);
  const byId = new Map(all.map((i) => [i.id, i]));
  const rows: string[][] = [["Track", "Tipe", "Fase", "Nama", "Mulai", "Selesai", "Hari kerja", "Jam kerja", "Hari kalender", "Status", "PIC", "Hard deadline", "Menunggu", "Catatan"]];
  for (const t of tracks) {
    for (const i of t.items) {
      const parent = i.parentId ? byId.get(i.parentId) : undefined;
      const waits = deps.filter((d) => d.itemId === i.id).map((d) => byId.get(d.dependsOnId)?.name ?? "").filter(Boolean);
      rows.push([
        t.name, i.parentId ? "Milestone" : "Fase", parent?.name ?? i.name, i.name, i.startDate, i.dueDate,
        String(workDays(cal, i.startDate, i.dueDate)), i.workHours ? String(i.workHours) : "", String(calendarDays(i.startDate, i.dueDate)),
        statusLabel(i.status), i.picName ?? "", i.hardDeadline ? "Ya" : "", waits.join("; "), i.notes,
      ]);
    }
  }
  return new Response("﻿" + toCsv(rows), {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="${slug}-timeline-${today()}.csv"`,
    },
  });
}
