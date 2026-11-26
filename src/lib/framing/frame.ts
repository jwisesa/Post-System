import { CAMERAS, FILM, type Camera, type FilmFormat, type Gate, type Mode } from "./cameras";

export const ASPECTS: { id: string; label: string; ar: number }[] = [
  { id: "239", label: "2.39:1", ar: 2.39 }, { id: "235", label: "2.35:1", ar: 2.35 }, { id: "200", label: "2.00:1", ar: 2 },
  { id: "190", label: "1.90:1", ar: 1.9 }, { id: "185", label: "1.85:1", ar: 1.85 }, { id: "178", label: "16:9", ar: 16 / 9 },
  { id: "166", label: "1.66:1", ar: 1.66 }, { id: "133", label: "4:3", ar: 4 / 3 }, { id: "100", label: "1:1", ar: 1 },
];
export const SQUEEZES = [1, 1.3, 1.5, 1.8, 2];
export const FPS = [23.976, 24, 25, 29.97, 30, 48, 50, 60];
export const STYLES = ["blueprint", "slate", "minimal"] as const;
export const PRESETS = {
  blueprint: { label: "Blueprint", style: "blueprint", layers: "smlcxifd" },
  slate: { label: "Slate", style: "slate", layers: "smlcxifd" },
  minimal: { label: "Minimal", style: "minimal", layers: "mcxf" },
} as const;
export const LAYERS = { g: "Panduan rasio", t: "Rule of thirds", s: "Siemens star", m: "Penanda tepi", l: "Label sudut / dimensi", c: "Silang tengah", f: "Safe frame (crop)", x: "Blok teks", i: "Daftar resolusi", d: "Delivery safe frame" } as const;
export const DELIVERY = [
  { id: "uhd", label: "UHD", w: 3840, h: 2160 }, { id: "dci4k", label: "DCI 4K", w: 4096, h: 2160 },
  { id: "2k", label: "2K DCI", w: 2048, h: 1080 }, { id: "hd", label: "HD", w: 1920, h: 1080 },
];
export const COLOR_CHARTS = [{ id: "", label: "Mati" }, { id: "bars", label: "Grayscale + bars" }, { id: "24", label: "24-patch" }, { id: "both", label: "Keduanya" }];
export type Rect = { x: number; y: number; w: number; h: number };

const even = (n: number) => Math.max(2, Math.round(n / 2) * 2);

/** Largest frame of ratio `ar` (after desqueeze by s) centred in a W x H sensor, in sensor px. ar 0 = full sensor. */
export function framing(W: number, H: number, ar: number, s = 1): Rect {
  if (!ar) return { x: 0, y: 0, w: W, h: H };
  let w: number, h: number;
  if ((W * s) / H > ar) { h = H; w = (H * ar) / s; } else { w = W; h = (W * s) / ar; }
  w = Math.min(W, even(w)); h = Math.min(H, even(h));
  return { x: (W - w) / 2, y: (H - h) / 2, w, h };
}
/** Conservative average glyph advance in em for Barlow 600 (real is ~0.5; over-estimating guarantees no clipping). */
export const CHAR_EM = 0.52;
export const textW = (t: string, size: number, em = CHAR_EM) => t.length * em * size;
/** Break at spaces into lines of at most `per` chars; tokens longer than `per` are hard-split. */
export function wrapText(t: string, per: number): string[] {
  per = Math.max(4, Math.floor(per));
  const out: string[] = []; let cur = "";
  for (let w of t.split(/\s+/).filter(Boolean)) {
    while (w.length > per) { if (cur) { out.push(cur); cur = ""; } out.push(w.slice(0, per)); w = w.slice(per); }
    if (!cur) cur = w; else if (cur.length + 1 + w.length <= per) cur += " " + w; else { out.push(cur); cur = w; }
  }
  if (cur) out.push(cur);
  return out.length ? out : [""];
}
/** One shared font size (shrunk in 8% steps, never below base*min) so every line fits maxW; lines still too wide at the floor are wrapped. */
export function fitBlock(texts: string[], base: number, maxW: number, min = 0.55, em = CHAR_EM): { size: number; lines: string[][] } {
  let size = base;
  while (size * 0.92 >= base * min && texts.some((t) => textW(t, size, em) > maxW)) size *= 0.92;
  return { size, lines: texts.map((t) => (textW(t, size, em) > maxW ? wrapText(t, maxW / (em * size)) : [t])) };
}
/** Stagger guide labels: alternate sides of centre, at most `cap` labelled; same-side labels are pushed down by `lh` and flagged for a leader tick. */
export function placeGuideLabels(tops: number[], lh: number, cap = 4) {
  const last = [-Infinity, -Infinity];
  return tops.map((top, i) => ({ top, i })).sort((a, b) => a.top - b.top || a.i - b.i).slice(0, cap).map(({ top, i }, n) => {
    const side = n % 2, y = Math.max(top, last[side] + lh * 1.15); last[side] = y;
    return { i, side, y, tick: y > top + 0.5 };
  });
}
/** Safe rectangle: the framing decision shrunk by `crop` percent (total, centred), whole pixels. 0 = same rect. */
export function safeRect(r: Rect, crop: number): Rect {
  const k = 1 - Math.min(40, Math.max(0, crop)) / 100, w = even(r.w * k), h = even(r.h * k);
  return { x: r.x + (r.w - w) / 2, y: r.y + (r.h - h) / 2, w, h };
}
/** Largest centred rect of delivery aspect dw:dh inside r. `sx` = source px width per canvas px (squeeze when output is squeezed).
 *  scale = source px per delivery px (>1 oversampled, <1 upscale). */
export function deliveryRect(r: Rect, dw: number, dh: number, sx = 1) {
  const ar = dw / dh, rar = (r.w * sx) / r.h;
  let w = r.w, h = r.h;
  if (rar > ar) w = even((r.h * ar) / sx); else h = even((r.w * sx) / ar);
  w = Math.min(r.w, w); h = Math.min(r.h, h);
  const srcW = w * sx;
  return { rect: { x: r.x + (r.w - w) / 2, y: r.y + (r.h - h) / 2, w, h }, srcW, scale: srcW / dw, upscale: srcW < dw };
}
/** Pure state transitions for the tool UI (one click = one update). */
export type Action = { t: "set"; p: Partial<State> } | { t: "layer"; k: string } | { t: "list"; key: "guides" | "dsf"; id: string; layer?: string } | { t: "reset"; project: string };
export const toggleLayer = (layers: string, k: string) => (layers.includes(k) ? layers.split(k).join("") : layers + k);
export function reduce(s: State, a: Action): State {
  if (a.t === "set") return { ...s, ...a.p };
  if (a.t === "reset") return { ...DEFAULTS, project: a.project };
  if (a.t === "layer") return { ...s, layers: toggleLayer(s.layers, a.k) };
  const cur = s[a.key] ? s[a.key].split(",") : [];
  const next = (cur.includes(a.id) ? cur.filter((x) => x !== a.id) : [...cur, a.id]).join(",");
  return { ...s, [a.key]: next, layers: a.layer && !s.layers.includes(a.layer) ? s.layers + a.layer : s.layers };
}

/** Film maths: 10-bit RGB DPX packed = 4 bytes per pixel. */
export function filmStats(f: FilmFormat, g: Gate, scanW: number, fps: number) {
  const w = even(scanW), h = even((scanW * g.mm[1]) / g.mm[0]);
  const bytes = w * h * 4;
  const ftPerMin = (fps * 60) / f.fpf;
  const roll = (ft: number) => ({ gb: (bytes * f.fpf * ft) / 1e9, min: (f.fpf * ft) / fps / 60 });
  return { w, h, bytes, mb: bytes / 1e6, gbPerMin: (bytes * fps * 60) / 1e9, ftPerMin, r400: roll(400), r1000: roll(1000) };
}

export type State = Record<"kind" | "cam" | "mode" | "film" | "gate" | "scan" | "ar" | "guides" | "sq" | "out" | "crop" | "style" | "dsf" | "cc" | "fps" | "project" | "title" | "dop" | "director" | "production" | "notes" | "unit" | "layers", string>;
export const DEFAULTS: State = { kind: "digital", cam: CAMERAS[0].id, mode: "", film: FILM[0].id, gate: "", scan: "4096", ar: "178", guides: "239,185", sq: "1", out: "desqueezed", crop: "5", style: "blueprint", dsf: "", cc: "", fps: "24", project: "", title: "", dop: "", director: "", production: "", notes: "", unit: "", layers: PRESETS.blueprint.layers };
export const SCANS = [{ id: "2048", label: "2K" }, { id: "4096", label: "4K" }, { id: "6144", label: "6K" }];

export function parseState(q: Record<string, string | string[] | undefined>, project = ""): State {
  const s = { ...DEFAULTS, project };
  for (const k of Object.keys(s) as (keyof State)[]) { const v = q[k]; const x = Array.isArray(v) ? v[0] : v; if (typeof x === "string") s[k] = x.slice(0, 120); }
  if (typeof q.crop !== "string" && typeof q.safety === "string" && +q.safety >= 50 && +q.safety <= 100) s.crop = String(100 - Math.round(+q.safety)); // legacy: safety = % kept
  if (!(STYLES as readonly string[]).includes(s.style)) s.style = DEFAULTS.style;
  return s;
}
export function serialize(s: State, project = ""): string {
  const p = new URLSearchParams();
  for (const k of Object.keys(s) as (keyof State)[]) if (s[k] !== DEFAULTS[k] && !(k === "project" && s[k] === project)) p.set(k, s[k]);
  return p.toString();
}

export type Spec = {
  /** W x H = output canvas (desqueezed width when desq), sensorW = recorded sensor width. */
  W: number; H: number; sensorW: number; desq: boolean; mm: [number, number]; camera: string; mode: string; codec?: string; film: boolean;
  squeeze: number; ar: number; arLabel: string; guides: { ar: number; label: string }[]; crop: number; style: string; cc: string; delivery: { id: string; label: string; w: number; h: number }[]; fps: number;
  /** recorded sensor px */ sensorH: number;
  info: { project: string; title: string; dop: string; director: string; production: string; notes: string; unit: string }; layers: string;
};
const arLabel = (ar: number) => ASPECTS.find((a) => a.ar === ar)?.label ?? `${ar.toFixed(2)}:1`;

export function buildSpec(s: State): Spec {
  const sq = SQUEEZES.includes(+s.sq) ? +s.sq : 1;
  const ar = ASPECTS.find((a) => a.id === s.ar)?.ar ?? (s.ar === "0" ? 0 : 16 / 9);
  let W: number, H: number, mm: [number, number], camera: string, mode: string, codec: string | undefined;
  const film = s.kind === "film";
  if (film) {
    const f = FILM.find((x) => x.id === s.film) ?? FILM[0], g = f.gates.find((x) => x.id === s.gate) ?? f.gates[0];
    const st = filmStats(f, g, +s.scan || 4096, 24);
    W = st.w; H = st.h; mm = g.mm; camera = f.label; mode = g.label;
  } else {
    const c = CAMERAS.find((x) => x.id === s.cam) ?? CAMERAS[0], m = c.modes.find((x) => x.id === s.mode) ?? c.modes[0];
    [W, H] = m.px; mm = m.mm; camera = `${c.brand} ${c.name}`; mode = m.label; codec = m.codecs?.join(" / ");
  }
  const desq = sq !== 1 && s.out !== "squeezed", sensorW = W;
  if (desq) W = even(W * sq);
  const guides = s.guides.split(",").map((id) => ASPECTS.find((a) => a.id === id)).filter((a): a is (typeof ASPECTS)[number] => !!a).map((a) => ({ ar: a.ar, label: a.label }));
  const fps = FPS.includes(+s.fps) ? +s.fps : 24;
  const delivery = DELIVERY.filter((d) => s.dsf.split(",").includes(d.id));
  const { project, title, dop, director, production, notes, unit } = s;
  return { W, H, sensorW, desq, mm, camera, mode, codec, film, squeeze: sq, ar, arLabel: ar ? arLabel(ar) : "Full sensor", guides, crop: Math.min(30, Math.max(0, Math.round(+s.crop) || 0)), style: (STYLES as readonly string[]).includes(s.style) ? s.style : "blueprint", cc: COLOR_CHARTS.some((c) => c.id === s.cc) ? s.cc : "", delivery, sensorH: H, fps, info: { project, title, dop, director, production, notes, unit }, layers: s.layers };
}
export type { Camera, Mode };

/** Resolution strings. Recorded = sensor mode; active = framing decision in sensor px; canvas/active-desqueezed only when desqueezed. */
export function resolutions(spec: Spec, d: Rect) {
  const sx = spec.desq ? spec.squeeze : 1, px = (w: number, h: number) => `${w} × ${h}`;
  return {
    recorded: px(spec.sensorW, spec.sensorH), active: px(Math.round(d.w / sx), d.h),
    canvas: spec.desq ? px(spec.W, spec.H) : "", activeDesq: spec.desq ? px(d.w, d.h) : "",
  };
}
