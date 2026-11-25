// What a view-only link may show. Budget and script are deliberately not here: they can never be selected.
import { z } from "zod";

export const SECTIONS = [
  ["today", "Hari Ini"],
  ["timeline", "Timeline"],
  ["deliverables", "Deliverables"],
  ["assets", "Aset & dokumen"],
  ["technical", "Technical Page"],
  ["team", "Tim"],
  ["checks", "Pemeriksaan"],
  ["feedback", "Feedback"],
] as const;
export type ShareSection = (typeof SECTIONS)[number][0];
export const sectionEnum = z.enum(SECTIONS.map((s) => s[0]) as [ShareSection, ...ShareSection[]]);
export const DEFAULT_SECTIONS: ShareSection[] = ["today", "timeline", "deliverables", "assets", "technical", "team"];

/** Unknown values are dropped (not an error), so a stale row can never widen access. */
export const cleanSections = (v: unknown): ShareSection[] => {
  const ok = new Set(sectionEnum.options);
  return [...new Set(Array.isArray(v) ? v : [])].filter((x): x is ShareSection => ok.has(x as ShareSection));
};
export const sectionLabel = (s: string) => SECTIONS.find((x) => x[0] === s)?.[1] ?? s;

type Sched = { tracks: { items: { id: string; parentId: string | null }[] }[]; deps: { itemId: string; dependsOnId: string }[] };
/** Drops hidden items and the children of hidden phases (items and dependencies). */
export function hideItems<T extends Sched>(s: T, hidden: Set<string>): T {
  if (!hidden.size) return s;
  const tracks = s.tracks.map((t) => ({ ...t, items: t.items.filter((i) => !hidden.has(i.id) && !(i.parentId && hidden.has(i.parentId))) }));
  const kept = new Set(tracks.flatMap((t) => t.items.map((i) => i.id)));
  return { ...s, tracks, deps: s.deps.filter((d) => kept.has(d.itemId) && kept.has(d.dependsOnId)) };
}
