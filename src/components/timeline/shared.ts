import { diffDays } from "@/lib/schedule/dates";
import type { Schedule } from "@/lib/schedule/service";

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
