import { CAMERAS, FILM, type Camera, type FilmFormat, type Gate, type Mode } from "./cameras";

export const ASPECTS: { id: string; label: string; ar: number }[] = [
  { id: "239", label: "2.39:1", ar: 2.39 }, { id: "235", label: "2.35:1", ar: 2.35 }, { id: "200", label: "2.00:1", ar: 2 },
  { id: "190", label: "1.90:1", ar: 1.9 }, { id: "185", label: "1.85:1", ar: 1.85 }, { id: "178", label: "16:9", ar: 16 / 9 },
  { id: "166", label: "1.66:1", ar: 1.66 }, { id: "133", label: "4:3", ar: 4 / 3 }, { id: "100", label: "1:1", ar: 1 },
];
export const SQUEEZES = [1, 1.3, 1.5, 1.8, 2];
export const FPS = [23.976, 24, 25, 29.97, 30, 48, 50, 60];
export const LAYERS = { g: "Panduan rasio", t: "Rule of thirds", s: "Siemens star", m: "Penanda tepi", l: "Label sudut", c: "Silang tengah", f: "Safety", x: "Blok teks" } as const;
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
export function safety(r: Rect, pct: number): Rect {
  const k = pct / 100, w = r.w * k, h = r.h * k;
  return { x: r.x + (r.w - w) / 2, y: r.y + (r.h - h) / 2, w, h };
}

/** Film maths: 10-bit RGB DPX packed = 4 bytes per pixel. */
export function filmStats(f: FilmFormat, g: Gate, scanW: number, fps: number) {
  const w = even(scanW), h = even((scanW * g.mm[1]) / g.mm[0]);
  const bytes = w * h * 4;
  const ftPerMin = (fps * 60) / f.fpf;
  const roll = (ft: number) => ({ gb: (bytes * f.fpf * ft) / 1e9, min: (f.fpf * ft) / fps / 60 });
  return { w, h, bytes, mb: bytes / 1e6, gbPerMin: (bytes * fps * 60) / 1e9, ftPerMin, r400: roll(400), r1000: roll(1000) };
}

export type State = Record<"kind" | "cam" | "mode" | "film" | "gate" | "scan" | "ar" | "guides" | "sq" | "safety" | "fps" | "project" | "title" | "dop" | "director" | "production" | "notes" | "unit" | "layers", string>;
export const DEFAULTS: State = { kind: "digital", cam: CAMERAS[0].id, mode: "", film: FILM[0].id, gate: "", scan: "4096", ar: "178", guides: "239,185", sq: "1", safety: "90", fps: "24", project: "", title: "", dop: "", director: "", production: "", notes: "", unit: "", layers: "gsmlcfx" };
export const SCANS = [{ id: "2048", label: "2K" }, { id: "4096", label: "4K" }, { id: "6144", label: "6K" }];

export function parseState(q: Record<string, string | string[] | undefined>, project = ""): State {
  const s = { ...DEFAULTS, project };
  for (const k of Object.keys(s) as (keyof State)[]) { const v = q[k]; const x = Array.isArray(v) ? v[0] : v; if (typeof x === "string") s[k] = x.slice(0, 120); }
  return s;
}
export function serialize(s: State, project = ""): string {
  const p = new URLSearchParams();
  for (const k of Object.keys(s) as (keyof State)[]) if (s[k] !== DEFAULTS[k] && !(k === "project" && s[k] === project)) p.set(k, s[k]);
  return p.toString();
}

export type Spec = {
  W: number; H: number; mm: [number, number]; camera: string; mode: string; codec?: string; film: boolean;
  squeeze: number; ar: number; arLabel: string; guides: { ar: number; label: string }[]; safety: number; fps: number;
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
  const guides = s.guides.split(",").map((id) => ASPECTS.find((a) => a.id === id)).filter((a): a is (typeof ASPECTS)[number] => !!a).map((a) => ({ ar: a.ar, label: a.label }));
  const fps = FPS.includes(+s.fps) ? +s.fps : 24;
  const { project, title, dop, director, production, notes, unit } = s;
  return { W, H, mm, camera, mode, codec, film, squeeze: sq, ar, arLabel: ar ? arLabel(ar) : "Full sensor", guides, safety: Math.min(100, Math.max(50, +s.safety || 90)), fps, info: { project, title, dop, director, production, notes, unit }, layers: s.layers };
}
export type { Camera, Mode };
