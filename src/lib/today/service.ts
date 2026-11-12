// Read-only roll-ups for the "Hari Ini" dashboard, the view-only tab and the weekly report.
import type { Db } from "@/db/client";
import { listAttachments } from "../assets/service";
import { isDone, deliverableStatus } from "../deliverables/catalog";
import { listDeliverables } from "../deliverables/service";
import { addDays, diffDays } from "../schedule/dates";
import { getSchedule } from "../schedule/service";
import { statusLabel } from "../schedule/templates";
import { getTeam, listActivity } from "../services";
import { versionStatus } from "../assets/catalog";

export const SOON_DAYS = 7;
export const STALE_DAYS = 3;

export type TodayEntry = {
  kind: "item" | "deliverable";
  id: string;
  name: string;
  /** Track name for schedule items, platform for deliverables. */
  context: string;
  dueDate: string;
  statusLabel: string;
  picName?: string | null;
  hardDeadline?: boolean;
};

const wibDate = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Jakarta" });
const byDue = (a: { dueDate: string }, b: { dueDate: string }) => a.dueDate.localeCompare(b.dueDate);

export async function getToday(db: Db, projectId: string, today: string, opts: { includeInternal: boolean }) {
  const [schedule, delivs, team, allAttachments] = await Promise.all([
    getSchedule(db, projectId, opts),
    listDeliverables(db, projectId, opts),
    getTeam(db, projectId, opts),
    listAttachments(db, projectId, opts),
  ]);
  const contacts = new Map(team.flatMap((g) => g.contacts).map((c) => [c.id, c]));

  const items = schedule.tracks.flatMap((t) => t.items.map((i) => ({ ...i, trackName: t.name })));
  const openItems = items.filter((i) => i.status !== "done");
  const delivered = delivs.filter((d) => d.origin === "delivered");
  const openDeliverables = delivered.filter((d) => !isDone(d.status) && d.dueDate);

  const entries: TodayEntry[] = [
    ...openItems.map((i): TodayEntry => ({ kind: "item", id: i.id, name: i.name, context: i.trackName, dueDate: i.dueDate, statusLabel: statusLabel(i.status), picName: i.picName, hardDeadline: i.hardDeadline })),
    ...openDeliverables.map((d): TodayEntry => ({ kind: "deliverable", id: d.id, name: d.name, context: d.platform, dueDate: d.dueDate!, statusLabel: deliverableStatus(d.status).label })),
  ].sort(byDue);
  const horizon = addDays(today, SOON_DAYS);

  const followUp = openItems
    .filter((i) => i.dueDate <= horizon)
    .map((i) => ({ i, days: diffDays(wibDate.format(i.updatedAt), today) }))
    .filter(({ days }) => days > STALE_DAYS)
    .sort((a, b) => byDue(a.i, b.i))
    .map(({ i, days }) => {
      const c = i.picContactId ? contacts.get(i.picContactId) : undefined;
      return {
        id: i.id, name: i.name, track: i.trackName, dueDate: i.dueDate, late: i.dueDate < today, daysSinceUpdate: days,
        picName: c?.name ?? null, picEmail: c?.email || null, picPhone: c?.phone || null,
      };
    });

  // Links on hidden targets stay hidden for viewers, same rule as getViewerData.
  const visible = new Set([...items.map((i) => i.id), ...delivs.map((d) => d.id)]);
  const where = new Map([
    ...items.map((i) => [i.id, `${i.trackName} / ${i.name}`] as const),
    ...delivs.map((d) => [d.id, d.name] as const),
  ]);
  const review = allAttachments
    .filter((a) => (opts.includeInternal || a.targetType === "project" || visible.has(a.targetId)) && a.versions[0] && a.versions[0].status !== "approved")
    .map((a) => ({
      id: a.id, label: a.label, number: a.versions[0].number, status: a.versions[0].status, statusLabel: versionStatus(a.versions[0].status).label,
      url: a.versions[0].url, where: a.targetType === "project" ? "Dokumen project" : (where.get(a.targetId) ?? "—"),
    }));

  const hardDeadlines = openItems
    .filter((i) => i.hardDeadline && i.dueDate >= today)
    .sort(byDue)
    .map((i) => ({ id: i.id, name: i.name, track: i.trackName, dueDate: i.dueDate, daysLeft: diffDays(today, i.dueDate) }));

  return {
    dueToday: entries.filter((e) => e.dueDate === today),
    late: entries.filter((e) => e.dueDate < today),
    next7: entries.filter((e) => e.dueDate > today && e.dueDate <= horizon),
    followUp,
    review,
    hardDeadlines,
    deliverables: { total: delivered.length, done: delivered.filter((d) => isDone(d.status)).length },
  };
}

export type TodayData = Awaited<ReturnType<typeof getToday>>;

/** Everything on the weekly report page. Internal items included (admin only). */
export async function getWeeklyReport(db: Db, projectId: string, today: string) {
  const [data, schedule, activity] = await Promise.all([
    getToday(db, projectId, today, { includeInternal: true }),
    getSchedule(db, projectId, { includeInternal: true }),
    listActivity(db, projectId, 500),
  ]);
  const since = addDays(today, -7);
  return {
    today: data,
    tracks: schedule.tracks.map((t) => ({
      id: t.id,
      name: t.name,
      phases: t.items.map((i) => ({
        id: i.id, name: i.name, milestone: !!i.parentId, status: i.status, statusLabel: statusLabel(i.status),
        dueDate: i.dueDate, slip: diffDays(i.baselineDue, i.dueDate), late: i.status !== "done" && i.dueDate < today,
      })),
    })),
    activity: activity.filter(({ entry }) => wibDate.format(entry.createdAt) >= since).map(({ entry, userName }) => ({ id: entry.id, summary: entry.summary, userName: userName ?? "—", createdAt: entry.createdAt.toISOString() })),
  };
}
