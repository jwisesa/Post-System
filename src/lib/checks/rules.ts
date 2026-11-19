// Non-blocking checks: pure rules comparing the Technical Page, deliverables and schedule.
import { getPreset, isDone, resolveSpec } from "../deliverables/catalog";

export type Finding = { rule: string; severity: "error" | "warn" | "info"; title: string; detail: string; fix: { label: string; href: string } };
export type CheckInput = {
  slug: string; tech: Record<string, string>;
  deliverables: { id: string; name: string; platform: string; trackId: string | null; spec: Record<string, string>; dueDate: string | null; status: string; origin: string; presetId: string | null; presetVersion: string | null }[];
  items: { id: string; name: string; trackId: string; trackName: string; parentId: string | null; dueDate: string }[];
  today: string;
};

export function parseRes(s: string): { w: number; h: number } | null {
  const m = /(\d{3,5})\s*[x×]\s*(\d{3,5})/i.exec(s ?? "");
  return m ? { w: +m[1], h: +m[2] } : null;
}
export function parseAspect(s: string): number | null {
  const m = /^\s*(\d+(?:\.\d+)?)\s*[:/]\s*(\d+(?:\.\d+)?)\s*$/.exec(s ?? "") ?? /^\s*(\d+(?:\.\d+)?)\s*$/.exec(s ?? "");
  if (!m) return null;
  const r = m[2] ? +m[1] / +m[2] : +m[1];
  return r > 0 && Number.isFinite(r) ? r : null;
}
const fps = (s: string | undefined) => {
  const n = parseFloat((s ?? "").replace(/\b(N?DF)\b/i, ""));
  return n > 0 ? n : null;
};
const same = (a: number, b: number) => Math.abs(a - b) < 0.005;
const isDcp = (res: string) => /scope|flat/i.test(res) || [[2048, 858], [1998, 1080], [4096, 1716], [3996, 2160]].some(([w, h]) => { const r = parseRes(res); return r?.w === w && r.h === h; });
const isVideo169 = (res: string) => /uhd|\bhd\b/i.test(res) || [[3840, 2160], [1920, 1080]].some(([w, h]) => { const r = parseRes(res); return r?.w === w && r.h === h; });

const tech = (slug: string) => `/admin/p/${slug}/technical`;
/** Link to the Technical Page, straight to the field `key` (sections open on arrival). */
const fixTech = (i: CheckInput, key?: string) => ({ label: "Perbaiki di Technical Page", href: key ? `${tech(i.slug)}#f-${key}` : tech(i.slug) });
const fixDel = (i: CheckInput) => ({ label: "Perbaiki di Deliverables", href: `/admin/p/${i.slug}/deliverables` });
const fixTl = (i: CheckInput) => ({ label: "Perbaiki di Timeline", href: `/admin/p/${i.slug}/timeline` });
const open = (d: CheckInput["deliverables"][number]) => !isDone(d.status);

/** Aspect mismatch between a resolution and an aspect ratio, or null when fine / unknown. */
function aspectMismatch(res: string, aspect: string) {
  const r = parseRes(res), a = parseAspect(aspect);
  if (!r || !a) return null;
  const actual = r.w / r.h;
  return Math.abs(actual - a) / a > 0.01 ? actual : null;
}

export const RULES: { id: string; run: (i: CheckInput) => Finding[] }[] = [
  { id: "fps.sound", run: (i) => {
    const s = fps(i.tech.sound_tc_fps), m = fps(i.tech.frameRate);
    if (s === null || m === null || same(s, m)) return [];
    return [{ rule: "fps.sound", severity: "warn", title: "Frame rate timecode suara berbeda dari master", detail: `Timecode suara ${i.tech.sound_tc_fps}, master ${i.tech.frameRate}. Sync audio bisa drift.`, fix: fixTech(i, "sound_tc_fps") }];
  } },
  { id: "fps.camera", run: (i) => {
    const m = fps(i.tech.frameRate);
    if (m === null) return [];
    const out: Finding[] = [];
    for (let n = 1; n <= 4; n++) {
      const c = fps(i.tech[`cam${n}_fps`]);
      if (c !== null && !same(c, m)) out.push({ rule: "fps.camera", severity: "info", title: `Kamera ${n} merekam ${i.tech[`cam${n}_fps`]} fps, master ${i.tech.frameRate}`, detail: "Wajar untuk slow motion atau overcrank; pastikan memang disengaja dan conform di post.", fix: fixTech(i, `cam${n}_fps`) });
    }
    return out;
  } },
  { id: "fps.deliverable", run: (i) => {
    const m = fps(i.tech.frameRate);
    if (m === null) return [];
    return i.deliverables.filter((d) => open(d) && d.origin !== "derived").flatMap((d) => {
      const f = fps(d.spec.frameRate);
      return f === null || same(f, m) ? [] : [{ rule: "fps.deliverable", severity: "warn" as const, title: `${d.name}: ${d.spec.frameRate} fps, master ${i.tech.frameRate}`, detail: `Deliverable ${d.platform} memakai frame rate berbeda dari master.`, fix: fixDel(i) }];
    });
  } },
  { id: "aspect.master", run: (i) => {
    const res = i.tech.masterResolution ?? "", asp = i.tech.aspectRatio ?? "";
    const actual = aspectMismatch(res, asp);
    if (actual === null) return [];
    return [{ rule: "aspect.master", severity: isDcp(res) ? "error" : "warn", title: "Resolusi master tidak cocok dengan aspect ratio", detail: `${res} berasio ${actual.toFixed(2)}:1, aspect ratio project ${asp}.`, fix: fixTech(i, "masterResolution") }];
  } },
  { id: "aspect.deliverable", run: (i) => i.deliverables.filter(open).flatMap((d) => {
    const res = d.spec.resolution ?? "", asp = d.spec.aspectRatio ?? "";
    const actual = aspectMismatch(res, asp);
    if (actual === null) return [];
    const a = parseAspect(asp)!;
    const box = isVideo169(res) && a > actual;
    return [{ rule: "aspect.deliverable", severity: isDcp(res) ? "error" as const : "warn" as const, title: `${d.name}: resolusi dan aspect ratio tidak cocok`, detail: `${res} berasio ${actual.toFixed(2)}:1, aspect ratio ${asp}.${box ? " Letterbox?" : ""}`, fix: fixDel(i) }];
  }) },
  { id: "due.beforeFinish", run: (i) => i.deliverables.filter((d) => open(d) && d.dueDate).flatMap((d) => {
    const phases = i.items.filter((x) => !x.parentId && /master|qc|deliver/i.test(x.name) && (d.trackId === null || x.trackId === d.trackId));
    const latest = phases.reduce<(typeof phases)[number] | null>((a, x) => (!a || x.dueDate > a.dueDate ? x : a), null);
    if (!latest || d.dueDate! >= latest.dueDate) return [];
    return [{ rule: "due.beforeFinish", severity: "warn" as const, title: `${d.name}: jatuh tempo sebelum "${latest.name}" selesai`, detail: `Deliverable ${d.dueDate}, ${latest.name} (${latest.trackName}) baru selesai ${latest.dueDate}.`, fix: fixTl(i) }];
  }) },
  { id: "preset.deviation", run: (i) => i.deliverables.flatMap((d) => {
    const p = d.presetId ? getPreset(d.presetId) : undefined;
    const item = p?.items.find((x) => x.name === d.name);
    if (!item) return [];
    const want = resolveSpec(item.spec, i.tech);
    const keys = Object.keys(want).filter((k) => k in d.spec && d.spec[k] !== want[k]);
    return keys.length ? [{ rule: "preset.deviation", severity: "info" as const, title: `${d.name} menyimpang dari preset ${p!.label}`, detail: `Beda: ${keys.join(", ")}.`, fix: fixDel(i) }] : [];
  }) },
  { id: "preset.version", run: (i) => i.deliverables.flatMap((d) => {
    const p = d.presetId ? getPreset(d.presetId) : undefined;
    if (!p || !d.presetVersion || d.presetVersion === p.specVersion) return [];
    return [{ rule: "preset.version", severity: "info" as const, title: `${d.name}: preset sudah diperbarui`, detail: `Dibuat dari ${d.presetVersion}, preset ${p.label} kini ${p.specVersion}.`, fix: fixDel(i) }];
  }) },
];

const ORDER = { error: 0, warn: 1, info: 2 };
export const runChecks = (i: CheckInput): Finding[] =>
  RULES.flatMap((r) => { try { return r.run(i); } catch { return []; } }).sort((a, b) => ORDER[a.severity] - ORDER[b.severity]);
