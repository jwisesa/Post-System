import { diffDays } from "@/lib/schedule/dates";
import type { Schedule } from "@/lib/schedule/service";
import { PHASE_COLORS } from "@/lib/schedule/templates";
import { calendarDays, workDays, type Cal } from "@/lib/schedule/workdays";

export type Track = Schedule["tracks"][number];
export type Item = Track["items"][number];
export type Mode = "edit" | "status" | "view";

export const isLate = (i: { dueDate: string; status: string }, today: string) => i.status !== "done" && i.dueDate < today;

/** "+3 hr" / "-2 hr" against the baseline due date, or "" when on plan. */
export function slip(i: { dueDate: string; baselineDue: string }) {
  const d = diffDays(i.baselineDue, i.dueDate);
  return d ? `${d > 0 ? "+" : ""}${d} hr` : "";
}

export const signed = (n: number) => `${n > 0 ? "+" : ""}${n} hr`;

/** Phase colour number (1..8) of every item: its own, else its phase's, else by the phase's position in its track. */
export function phaseIndex(tracks: Track[]) {
  const n = new Map<string, number>();
  for (const t of tracks) {
    let k = 0;
    for (const i of t.items) if (!i.parentId) n.set(i.id, i.color ?? ((k++ % PHASE_COLORS) + 1));
    for (const i of t.items) if (i.parentId) n.set(i.id, i.color ?? n.get(i.parentId) ?? 1);
  }
  return (id: string) => n.get(id) ?? 1;
}

/** "12 hari kerja · 16 hari kalender" (or just the calendar count when nothing is blocked). */
export function durationLabel(cal: Cal, start: string, due: string, hours?: number | null) {
  const [c, w] = [calendarDays(start, due), workDays(cal, start, due)];
  const h = hours ? ` · ${hours} jam kerja` : "";
  return (c === w ? `${c} hari` : `${w} hari kerja · ${c} hari kalender`) + h;
}

/** 0..1 bar fill: status pins the ends; running items use finished milestones, else elapsed share of their dates. */
export function progressOf(i: { status: string; startDate: string; dueDate: string }, kids: { status: string }[], today: string) {
  if (i.status === "not_started") return 0;
  if (i.status === "done" || i.status === "review") return 1;
  if (kids.length) return kids.filter((k) => k.status === "done").length / kids.length;
  const total = diffDays(i.startDate, i.dueDate) + 1;
  const gone = today < i.startDate ? 0 : Math.min(total, diffDays(i.startDate, today) + 1);
  return Math.min(0.95, Math.max(0.05, gone / total));
}
