import { getDb } from "@/db/client";
import { getCurrentUser } from "@/lib/auth/session";
import { toCsv } from "@/lib/schedule/csv";
import { today } from "@/lib/schedule/dates";
import { listPoints } from "@/lib/feedback/service";
import { getSchedule } from "@/lib/schedule/service";
import { statusLabel } from "@/lib/schedule/templates";
import { calendarDays, calOf, workDays } from "@/lib/schedule/workdays";
import { getProjectForUser } from "@/lib/services";

export async function GET(req: Request, ctx: { params: Promise<{ slug: string }> }) {
  const { slug } = await ctx.params;
  const user = await getCurrentUser();
  if (!user) return new Response("Unauthorized", { status: 401 });
  const db = await getDb();
  const row = await getProjectForUser(db, user.id, slug);
  if (!row) return new Response("Not found", { status: 404 });

  const csv = (rows: string[][], name: string) =>
    new Response("\uFEFF" + toCsv(rows), {
      headers: { "Content-Type": "text/csv; charset=utf-8", "Content-Disposition": `attachment; filename="${slug}-${name}-${today()}.csv"` },
    });

  if (new URL(req.url).searchParams.get("type") === "feedback") {
    const [sched, points] = await Promise.all([getSchedule(db, row.project.id, { includeInternal: true }), listPoints(db, row.project.id, { includeInternal: true })]);
    const all = sched.tracks.flatMap((t) => t.items.map((i) => ({ ...i, track: t.name })));
    const byId = new Map(all.map((i) => [i.id, i]));
    const label = { open: "Belum dicek", fixed: "Sudah", dropped: "Tidak dikerjakan" } as const;
    const rows: string[][] = [["Track", "Fase", "Milestone", "Tanggal", "Ref", "Feedback", "Dari", "Status", "Dicek di", "Catatan cek"]];
    for (const i of all) {
      for (const p of points.filter((x) => x.itemId === i.id)) {
        const parent = i.parentId ? byId.get(i.parentId) : undefined;
        rows.push([i.track, parent?.name ?? i.name, i.parentId ? i.name : "", i.startDate, p.ref, p.body, p.fromWho, label[p.status], p.checkedItemId ? (byId.get(p.checkedItemId)?.name ?? "") : "", p.checkNote]);
      }
    }
    return csv(rows, "feedback");
  }

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
