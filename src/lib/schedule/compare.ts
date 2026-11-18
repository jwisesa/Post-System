import type { ScheduleSnapshot } from "@/db/schema";
import { addDays } from "./dates";
import { workDays, type Cal } from "./workdays";

/** Working days from `from` to `to`: 0 when equal, negative when `to` is earlier. */
export function signedWorkDays(cal: Cal, from: string, to: string): number {
  if (from === to) return 0;
  return from < to ? workDays(cal, addDays(from, 1), to) : -workDays(cal, addDays(to, 1), from);
}

export type DiffRow = {
  id: string; track: string; parent: string | null; kind: "changed" | "added" | "removed" | "renamed" | "same";
  name: string; oldName?: string; old?: { start: string; due: string }; now?: { start: string; due: string }; dStart: number; dDue: number;
};

type SItem = ScheduleSnapshot["items"][number];

/** Compares two snapshots by item id. A renamed item keeps its oldName and date deltas. */
export function diffSnapshots(a: ScheduleSnapshot, b: ScheduleSnapshot, cal: Cal): DiffRow[] {
  const aItems = new Map(a.items.map((i) => [i.id, i]));
  const bItems = new Map(b.items.map((i) => [i.id, i]));
  const tracks = [...b.tracks, ...a.tracks.filter((t) => !b.tracks.some((x) => x.id === t.id))];
  const rows: DiffRow[] = [];
  const seen = new Set<string>();
  const one = (i: SItem, track: string): DiffRow => {
    seen.add(i.id);
    const o = aItems.get(i.id), n = bItems.get(i.id);
    const base = { id: i.id, track, parent: i.parentId, name: (n ?? i).name };
    if (!o && n) return { ...base, kind: "added", now: { start: n.startDate, due: n.dueDate }, dStart: 0, dDue: 0 };
    if (o && !n) return { ...base, kind: "removed", old: { start: o.startDate, due: o.dueDate }, dStart: 0, dDue: 0 };
    const dStart = signedWorkDays(cal, o!.startDate, n!.startDate), dDue = signedWorkDays(cal, o!.dueDate, n!.dueDate);
    const kind = o!.name !== n!.name ? "renamed" : o!.startDate !== n!.startDate || o!.dueDate !== n!.dueDate ? "changed" : "same";
    return { ...base, kind, oldName: o!.name !== n!.name ? o!.name : undefined, old: { start: o!.startDate, due: o!.dueDate }, now: { start: n!.startDate, due: n!.dueDate }, dStart, dDue };
  };
  for (const t of tracks) {
    // Items on b's side win the track; an item that moved track shows under its newest track.
    const pool = new Map<string, SItem>();
    for (const i of [...a.items, ...b.items]) if ((bItems.get(i.id) ?? i).trackId === t.id) pool.set(i.id, bItems.get(i.id) ?? i);
    const all = [...pool.values()];
    for (const p of all.filter((i) => !i.parentId || !pool.has(i.parentId))) {
      rows.push(one(p, t.name));
      for (const m of all.filter((i) => i.parentId === p.id)) rows.push(one(m, t.name));
    }
  }
  return rows;
}
