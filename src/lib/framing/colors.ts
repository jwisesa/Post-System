/** Reference colours: 8-bit sRGB / Rec.709 primaries, display-referred (not scene-referred). Generic patches, not any vendor chart. */
const h = (v: number) => Math.round(v).toString(16).padStart(2, "0");
const g = (pct: number) => { const v = (h((pct / 100) * 255)); return `#${v}${v}${v}`; };
/** 11-step grey ramp, 0-100 (video-level %, code values 0-255 full range). */
export const RAMP = Array.from({ length: 11 }, (_, i) => ({ label: String(i * 10), hex: g(i * 10) }));
/** 75% bars: white, yellow, cyan, green, magenta, red, blue. */
const b = (r: number, gr: number, bl: number) => `#${h(r * 191)}${h(gr * 191)}${h(bl * 191)}`;
export const BARS75 = [["W", 1, 1, 1], ["Y", 1, 1, 0], ["C", 0, 1, 1], ["G", 0, 1, 0], ["M", 1, 0, 1], ["R", 1, 0, 0], ["B", 0, 0, 1]].map(([l, r, gr, bl]) => ({ label: l as string, hex: b(+r, +gr, +bl) }));
const f = (r: number, gr: number, bl: number) => `#${h(r * 255)}${h(gr * 255)}${h(bl * 255)}`;
export const PRIMARIES100 = [["R", 1, 0, 0], ["G", 0, 1, 0], ["B", 0, 0, 1], ["C", 0, 1, 1], ["M", 1, 0, 1], ["Y", 1, 1, 0]].map(([l, r, gr, bl]) => ({ label: l as string, hex: f(+r, +gr, +bl) }));
/** Skin / memory-colour patches (approximate sRGB values for light to dark skin, foliage, sky, sand). */
export const MEMORY = [
  { label: "Skin 1", hex: "#f3d2b8" }, { label: "Skin 2", hex: "#e0a98a" }, { label: "Skin 3", hex: "#c08560" },
  { label: "Skin 4", hex: "#8d5a3b" }, { label: "Skin 5", hex: "#5c3a26" }, { label: "Skin 6", hex: "#3a2418" },
];
/** 24-patch reference, 6 columns x 4 rows (sRGB 8-bit, own generic values). */
export const PATCH24 = [
  "#735244", "#c29682", "#627a9d", "#576c43", "#8580b1", "#67bdaa",
  "#d67e2c", "#505ba6", "#c15a63", "#5e3c6c", "#9dbc40", "#e0a32e",
  "#383d96", "#469449", "#af363c", "#e7c71f", "#bb5695", "#0885a1",
  "#f3f3f2", "#c8c8c8", "#a0a0a0", "#7a7a79", "#555555", "#343434",
];
export const COLOR_NOTE = "8-bit sRGB / Rec.709, display-referred";
