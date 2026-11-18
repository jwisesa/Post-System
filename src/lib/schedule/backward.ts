// Backward planning: a template holds structure only (lengths in working days or hours,
// dependencies, milestone positions, department names). Given a release date the plan walks
// back from it on working days and reports how far each phase falls short of today.
import { z } from "zod";
import { InputError } from "../services";
import { addDays, diffDays } from "./dates";
import { wouldCycle, type Dep } from "./shift";
import { PHASE_COLORS, type TrackTemplate } from "./templates";
import { daysForHours, endAfter, snap, startBefore, workDays, type Cal } from "./workdays";

export type TplMilestone = { name: string; at: number; group?: string };
export type TplPhase = { key: string; name: string; days?: number; hours?: number; color: number | null; after: string[]; group?: string; hard?: boolean; internal?: boolean; endBefore?: number; milestones: TplMilestone[] };
export type TemplateDef = { v: 1; tracks: { name: string; phases: TplPhase[] }[] };
export type PlanPhase = { key: string; track: number; name: string; start: string; due: string; days: number; hours: number | null; shortfall: number; hard: boolean; group?: string; internal: boolean; color: number | null; after: string[]; milestones: { name: string; date: string; group?: string }[] };
export type Plan = {
  release: string; phases: PlanPhase[]; fits: boolean; shortfall: number;
  suggestion: null | { factor: number; fits: boolean; phases: PlanPhase[]; minRelease: string | null };
};

const text = (max: number) => z.string().trim().min(1).max(max);
const group = text(80).optional();
const schema = z.object({
  v: z.literal(1),
  tracks: z.array(z.object({
    name: text(120),
    phases: z.array(z.object({
      key: text(120),
      name: text(120),
      days: z.number().int().min(1).max(999).optional(),
      hours: z.number().int().min(1).max(9999).optional(),
      color: z.number().int().min(1).max(PHASE_COLORS).nullable(),
      after: z.array(z.string()),
      group,
      hard: z.boolean().optional(),
      internal: z.boolean().optional(),
      endBefore: z.number().int().min(0).max(999).optional(),
      milestones: z.array(z.object({ name: text(120), at: z.number().min(0).max(1), group })),
    }).refine((p) => p.days !== undefined || p.hours !== undefined, { message: "Fase butuh durasi (hari atau jam)." })).max(300),
  })).max(20),
});

/** Validates stored or imported template JSON; throws InputError with an Indonesian message. */
export function parseTemplateDef(raw: unknown): TemplateDef {
  const r = schema.safeParse(raw);
  if (!r.success) throw new InputError(`Template tidak valid: ${r.error.issues[0]?.message ?? "format salah"}.`);
  const phases = r.data.tracks.flatMap((t) => t.phases);
  if (phases.length > 300) throw new InputError("Template terlalu besar (maksimal 300 fase).");
  const keys = new Set<string>();
  for (const p of phases) {
    if (keys.has(p.key)) throw new InputError(`Template tidak valid: kunci fase "${p.key}" dipakai dua kali.`);
    keys.add(p.key);
  }
  const deps: Dep[] = [];
  for (const p of phases) {
    for (const a of p.after) {
      if (!keys.has(a)) throw new InputError(`Template tidak valid: "${p.name}" menunggu fase yang tidak ada.`);
      if (wouldCycle(deps, p.key, a)) throw new InputError(`Template tidak valid: dependency "${p.name}" berputar.`);
      deps.push({ itemId: p.key, dependsOnId: a });
    }
  }
  return r.data;
}

/** A built-in track template as a TemplateDef (names become keys). */
export function fromBuiltin(t: TrackTemplate, cal: Cal): TemplateDef {
  // ponytail: built-ins are calendar days; 5/7 approximation
  const days = (n: number) => (cal.skipWeekends ? Math.max(1, Math.round((n * 5) / 7)) : n);
  return parseTemplateDef({
    v: 1,
    tracks: [{
      name: t.defaultName,
      phases: t.phases.map((p) => ({ key: p.name, name: p.name, days: days(p.days), color: p.color, after: p.after ?? [], milestones: (p.milestones ?? []).map((m) => ({ name: m.name, at: m.at })) })),
    }],
  });
}

const lengthOf = (p: TplPhase, cal: Cal) => (p.hours ? daysForHours(cal, p.hours) : (p.days ?? 1));

export function planBackward(def: TemplateDef, release: string, cal: Cal, today: string, compress?: { factor: number; keys: Set<string> }): Plan {
  const R = snap(cal, release, -1);
  const T = snap(cal, today);
  const flat = def.tracks.flatMap((t, track) => t.phases.map((p) => ({ p, track })));
  const succ = new Map<string, string[]>(flat.map(({ p }) => [p.key, []]));
  for (const { p } of flat) for (const a of p.after) succ.get(a)?.push(p.key);
  const byKey = new Map(flat.map((f) => [f.p.key, f]));
  const done = new Map<string, PlanPhase>();
  // Reverse topological order: a phase is placed once everything that waits for it is placed.
  for (let left = flat.length; left > 0; ) {
    const before = left;
    for (const { p, track } of flat) {
      if (done.has(p.key) || succ.get(p.key)!.some((k) => !done.has(k))) continue;
      const base = lengthOf(p, cal);
      const len = compress?.keys.has(p.key) ? Math.max(1, Math.ceil(base * compress.factor)) : base;
      const nexts = succ.get(p.key)!.map((k) => done.get(k)!.start);
      const due = nexts.length ? snap(cal, addDays(nexts.sort()[0], -1), -1) : startBefore(cal, R, (p.endBefore ?? 0) + 1);
      const start = startBefore(cal, due, len);
      const span = diffDays(start, due);
      done.set(p.key, {
        key: p.key, track, name: p.name, start, due, days: len, hours: p.hours ?? null,
        shortfall: start < T ? workDays(cal, start, addDays(T, -1)) : 0,
        hard: !!p.hard, group: p.group, internal: !!p.internal, color: p.color, after: p.after,
        milestones: p.milestones.map((m) => ({ name: m.name, group: m.group, date: [snap(cal, addDays(start, Math.round(m.at * span)), -1), start].sort().at(-1)! })),
      });
      left--;
    }
    if (left === before) throw new InputError("Template tidak valid: dependency berputar.");
  }
  const phases = flat.map(({ p }) => done.get(p.key)!);
  const shortfall = Math.max(0, ...phases.map((p) => p.shortfall));
  const plan: Plan = { release: R, phases, fits: shortfall === 0, shortfall, suggestion: null };
  if (plan.fits || compress) return plan;

  // Compress only what is late plus everything downstream of it, never hard phases.
  const keys = new Set<string>();
  const add = (k: string) => { if (!keys.has(k)) { keys.add(k); succ.get(k)!.forEach(add); } };
  phases.filter((p) => p.shortfall > 0).forEach((p) => add(p.key));
  for (const k of [...keys]) if (byKey.get(k)!.p.hard) keys.delete(k);
  const at = (pct: number) => planBackward(def, release, cal, today, { factor: pct / 100, keys });
  if (!at(1).fits) {
    const floor = at(1);
    return { ...plan, suggestion: { factor: 0.01, fits: false, phases: floor.phases, minRelease: endAfter(cal, R, floor.shortfall + 1) } };
  }
  let [lo, hi] = [1, 99]; // largest whole percent that still fits
  while (lo < hi) { const mid = Math.ceil((lo + hi) / 2); if (at(mid).fits) lo = mid; else hi = mid - 1; }
  return { ...plan, suggestion: { factor: lo / 100, fits: true, phases: at(lo).phases, minRelease: null } };
}

type SItem = { id: string; trackId: string; parentId: string | null; name: string; startDate: string; dueDate: string; color: number | null; workHours: number | null; hardDeadline: boolean; internal: boolean };

/** Structure of the selected tracks (phases + their milestones) as a template. Dates, status and PICs are left out. */
export function defFromSchedule<I extends SItem>(tracks: { id: string; name: string }[], items: I[], deps: Dep[], groupOf: (i: I) => string | undefined, cal: Cal): TemplateDef {
  const ids = new Set(tracks.map((t) => t.id));
  const phases = items.filter((i) => !i.parentId && ids.has(i.trackId));
  const keyOf = new Map<string, string>();
  const used = new Set<string>();
  for (const p of phases) {
    let k = p.name, n = 2;
    while (used.has(k)) k = `${p.name} (${n++})`;
    used.add(k);
    keyOf.set(p.id, k);
  }
  const hasSucc = new Set(deps.filter((d) => keyOf.has(d.itemId) && keyOf.has(d.dependsOnId)).map((d) => d.dependsOnId));
  const last = phases.map((p) => p.dueDate).sort().at(-1);
  return {
    v: 1,
    tracks: tracks.map((t) => ({
      name: t.name,
      phases: phases.filter((p) => p.trackId === t.id).map((p) => {
        const span = Math.max(1, diffDays(p.startDate, p.dueDate));
        const tail = !hasSucc.has(p.id) && last ? workDays(cal, p.dueDate, last) - 1 : 0;
        return {
          key: keyOf.get(p.id)!, name: p.name,
          ...(p.workHours ? { hours: p.workHours } : { days: Math.max(1, workDays(cal, p.startDate, p.dueDate)) }),
          color: p.color,
          after: deps.filter((d) => d.itemId === p.id && keyOf.has(d.dependsOnId)).map((d) => keyOf.get(d.dependsOnId)!),
          ...(groupOf(p) ? { group: groupOf(p) } : {}),
          ...(p.hardDeadline ? { hard: true } : {}),
          ...(p.internal ? { internal: true } : {}),
          ...(tail > 0 ? { endBefore: tail } : {}),
          milestones: items.filter((m) => m.parentId === p.id).map((m) => ({ name: m.name, at: Math.round(Math.min(1, Math.max(0, diffDays(p.startDate, m.startDate) / span)) * 1000) / 1000, ...(groupOf(m) ? { group: groupOf(m) } : {}) })),
        };
      }),
    })),
  };
}
