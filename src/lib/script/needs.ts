import { fmtRange } from "../schedule/dates";
import { fmtDuration, TAG_KINDS, TAG_LABEL, type PostTag, type TagKind } from "./types";

export type Phase = { id: string; name: string; startDate: string; dueDate: string; track?: string };
/** Name, track and date range: the dates keep same-named phases apart. */
export const phaseLabel = (p: Phase) => `${p.track ? `${p.name} (${p.track})` : p.name} · ${fmtRange(p.startDate, p.dueDate)}`;
type NeedScene = { id?: string; number: string; heading?: string; estSeconds: number; postTags: PostTag[] };

export type KindNeed = { kind: TagKind; scenes: number; suggested: number; seconds: number; numbers: string[]; phases: Phase[]; unlinked: number };

/** Per tag kind: scenes, total estimate, scene numbers, linked phases and how many scenes have no phase. Script order. */
export function postNeeds(scenes: NeedScene[], phases: Phase[]): KindNeed[] {
  const byId = new Map(phases.map((p) => [p.id, p]));
  return TAG_KINDS.flatMap((kind) => {
    const hit = scenes.map((s) => [s, s.postTags.find((t) => t.kind === kind)] as const).filter((x): x is [NeedScene, PostTag] => !!x[1]);
    if (!hit.length) return [];
    const linked = new Set<string>();
    let unlinked = 0;
    for (const [, t] of hit) { if (t.itemId && byId.has(t.itemId)) linked.add(t.itemId); else unlinked++; }
    return [{
      kind, scenes: hit.length, suggested: hit.filter(([, t]) => t.auto).length, seconds: hit.reduce((n, [s]) => n + s.estSeconds, 0),
      numbers: hit.map(([s]) => s.number), phases: [...linked].map((id) => byId.get(id)!), unlinked,
    }];
  });
}

/** `items` = the first few scenes with their one-line excerpt, for the timeline drawer. */
export type PhaseNeed = { kind: TagKind; scenes: number; seconds: number; numbers: string[]; items: { id: string; number: string; heading: string; excerpt: string }[] };

/** "Adegan terkait" for the timeline drawer: tags linked to each phase. */
export function needsByPhase(scenes: NeedScene[]): Record<string, PhaseNeed[]> {
  const out: Record<string, Map<TagKind, PhaseNeed>> = {};
  for (const s of scenes) for (const t of s.postTags) {
    if (!t.itemId) continue;
    const m = (out[t.itemId] ??= new Map());
    const n = m.get(t.kind) ?? { kind: t.kind, scenes: 0, seconds: 0, numbers: [], items: [] };
    n.scenes++; n.seconds += s.estSeconds; n.numbers.push(s.number);
    if (s.id && n.items.length < 5) n.items.push({ id: s.id, number: s.number, heading: s.heading ?? "", excerpt: (t.excerpt ?? "").slice(0, 160) });
    m.set(t.kind, n);
  }
  return Object.fromEntries(Object.entries(out).map(([id, m]) => [id, TAG_KINDS.flatMap((k) => m.get(k) ?? [])]));
}


/** CSV rows for `type=post`: one row per scene tag. Keyword and notes only; never script text or excerpts. */
export function postCsvRows(scenes: (NeedScene & { heading: string })[], phases: Phase[]): string[][] {
  const name = new Map(phases.map((p) => [p.id, phaseLabel(p)]));
  return [
    ["Jenis", "Adegan", "Judul", "Perkiraan durasi", "Catatan", "Fase terkait", "Status tag"],
    ...scenes.flatMap((s) => s.postTags.map((t) => [TAG_LABEL[t.kind], s.number, s.heading, fmtDuration(s.estSeconds), t.note || (t.keyword ? `Kata kunci: ${t.keyword}` : ""), (t.itemId && name.get(t.itemId)) || "", t.auto ? "Saran" : "Dikonfirmasi"])),
  ];
}
