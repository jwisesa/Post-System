// Pure month layout shared by the interactive calendar and the printable one (no client hooks).
import { addDays, diffDays } from "@/lib/schedule/dates";
import type { Item } from "./shared";

export const DOW = ["Sen", "Sel", "Rab", "Kam", "Jum", "Sab", "Min"];
export const LANE = 20; // px per bar lane
export const HEAD = 20; // px for the day number
export const monthFmt = new Intl.DateTimeFormat("id-ID", { month: "long", year: "numeric", timeZone: "UTC" });
export const mondayOf = (d: string) => addDays(d, -((new Date(`${d}T00:00:00Z`).getUTCDay() + 6) % 7));

export type Seg = { item: Item; col: number; span: number; lane: number };

/** Monday-first weeks of the month starting at `month` (YYYY-MM-01): phases packed into lanes, milestones per day. */
export function monthWeeks(items: Item[], month: string) {
  const next = new Date(`${month}T00:00:00Z`);
  next.setUTCMonth(next.getUTCMonth() + 1);
  const last = addDays(next.toISOString().slice(0, 10), -1);
  const start = mondayOf(month);
  const rows = Math.floor(diffDays(start, mondayOf(last)) / 7) + 1;
  const phases = items.filter((i) => !i.parentId).sort((a, b) => a.startDate.localeCompare(b.startDate));
  const miles = items.filter((i) => i.parentId);
  return Array.from({ length: rows }, (_, w) => {
    const ws = addDays(start, w * 7);
    const we = addDays(ws, 6);
    const ends: number[] = []; // last occupied column per lane
    const segs: Seg[] = [];
    for (const item of phases) {
      if (item.startDate > we || item.dueDate < ws) continue;
      const col = Math.max(0, diffDays(ws, item.startDate));
      const end = Math.min(6, diffDays(ws, item.dueDate));
      let lane = ends.findIndex((e) => e < col);
      if (lane < 0) lane = ends.length;
      ends[lane] = end;
      segs.push({ item, col, span: end - col + 1, lane });
    }
    const days = Array.from({ length: 7 }, (_, c) => {
      const d = addDays(ws, c);
      return { d, miles: miles.filter((m) => m.startDate === d) };
    });
    return { key: ws, segs, lanes: ends.length, days };
  });
}
