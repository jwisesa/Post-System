// Data-rate table for the drive calculator. EVERY built-in number below was read from the manufacturer document named in its
// `source` (fetched 2026-11-24). Rates are Mbit/s (decimal) at `refFps`; other frame rates scale linearly (an estimate).
// Not included because no manufacturer document could be read: ARRI ALEXA 35 / Mini, Sony Venice / FX, Blackmagic BRAW, Canon C-series.

export type RateRow = { id: string; maker: string; label: string; models: string[]; formats: string[]; res: string[]; refFps: number; mbps: number; source: { url: string; title: string; accessed: string } | null; note?: string };

export const norm = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, "");

const ACC = "2026-11-24";
const APPLE = { url: "https://www.apple.com/final-cut-pro/docs/Apple_ProRes_White_Paper.pdf", title: "Apple ProRes White Paper (April 2022)", accessed: ACC };
const AVID = { url: "https://kb.avid.com/pkb/articles/en_US/Knowledge/DNxHR-Codec-Bandwidth-Specifications", title: "Avid: DNxHR Codec Bandwidth Specifications", accessed: ACC };
const RED = { url: "https://docs.red.com/955-0225/955-0225_V1.7+Rev-B+RED+PS,+V-RAPTOR+%5BX%5D+8K+VV+Operation+Guide+HTML/Content/4_Menus/b_ProjSet/R3D_Quality.htm", title: "RED V-RAPTOR [X] 8K VV Operation Guide 955-0225 V1.7: R3D Quality", accessed: ACC };
const ARRI = { url: "https://www.arri.com/en/learn-help/learn-help-camera-system/pre-postproduction/file-formats-data-handling/arriraw-faq", title: "ARRI: ARRIRAW FAQ", accessed: ACC };

const HD = ["1920x1080", "1920x1080hd", "hd", "1080p"];
const UHD = ["3840x2160", "3840x2160uhd", "uhd", "4kuhd", "2160p"];
const pr = (id: string, label: string, mbps: number, fmts: string[]): RateRow => ({ id, maker: "Apple", label, models: [], formats: fmts.map(norm), res: HD.map(norm), refFps: 29.97, mbps, source: APPLE, note: "Target rate di 1920x1080, 29,97 fps. Frame lebih besar naik kira-kira sebanding jumlah piksel: tambahkan baris proyek." });
// Avid publishes MB/s; the bytes-per-frame behind it (e.g. 909312 B/frame for HD HQ) show the unit is MiB/s, so Mbit/s = x * 1.048576 * 8.
const dnx = (id: string, label: string, fmts: string[], res: string[], resLabel: string, mbps: number): RateRow => ({ id, maker: "Avid", label: `${label} ${resLabel}`, models: [], formats: fmts.map(norm), res: res.map(norm), refFps: 23.976, mbps, source: AVID, note: "Tabel Avid dalam MB/s di 23,976 fps; dikonversi ke Mbit/s (x 8,39)." });
const red = (id: string, label: string, res: string[], mbs: number): RateRow => ({ id, maker: "RED", label, models: ["vraptor", "redvraptor", "vraptorx", "redvraptorx"].map(norm), formats: ["redcoderawr3d", "r3d", "redcode"], res: res.map(norm), refFps: 24, mbps: mbs * 8, source: RED, note: "Tabel RED dalam MB/s di 24p; dikali 8. Satu baris per kompresi dan resolusi." });
const arri = (id: string, label: string, models: string[], fmts: string[], res: string[], mbFrame: number, note: string): RateRow => ({ id, maker: "ARRI", label, models: models.map(norm), formats: fmts.map(norm), res: res.map(norm), refFps: 24, mbps: Math.round(mbFrame * 24 * 8 * 10) / 10, source: ARRI, note });

export const RATES: RateRow[] = [
  pr("pr-proxy", "ProRes 422 Proxy 1080p", 45, ["ProRes 422 Proxy", "Apple ProRes 422 Proxy"]),
  pr("pr-lt", "ProRes 422 LT 1080p", 102, ["ProRes 422 LT", "Apple ProRes 422 LT"]),
  pr("pr-422", "ProRes 422 1080p", 147, ["ProRes 422", "Apple ProRes 422"]),
  pr("pr-hq", "ProRes 422 HQ 1080p", 220, ["ProRes 422 HQ", "Apple ProRes 422 HQ"]),
  pr("pr-4444", "ProRes 4444 1080p", 330, ["ProRes 4444", "Apple ProRes 4444"]),
  pr("pr-4444xq", "ProRes 4444 XQ 1080p", 500, ["ProRes 4444 XQ", "Apple ProRes 4444 XQ"]),
  dnx("dnx-hd-lb", "DNxHR LB", ["DNxHR LB"], HD, "1080p", 36.2),
  dnx("dnx-hd-sq", "DNxHR SQ", ["DNxHR SQ"], HD, "1080p", 115.5),
  dnx("dnx-hd-hq", "DNxHR HQ", ["DNxHR HQ"], HD, "1080p", 174.4),
  dnx("dnx-hd-hqx", "DNxHR HQX", ["DNxHR HQX"], HD, "1080p", 174.4),
  dnx("dnx-hd-444", "DNxHR 444", ["DNxHR 444"], HD, "1080p", 349.6),
  dnx("dnx-uhd-lb", "DNxHR LB", ["DNxHR LB"], UHD, "UHD", 143.8),
  dnx("dnx-uhd-sq", "DNxHR SQ", ["DNxHR SQ"], UHD, "UHD", 462),
  dnx("dnx-uhd-hq", "DNxHR HQ", ["DNxHR HQ"], UHD, "UHD", 698.4),
  dnx("dnx-uhd-hqx", "DNxHR HQX", ["DNxHR HQX"], UHD, "UHD", 698.4),
  dnx("dnx-uhd-444", "DNxHR 444", ["DNxHR 444"], UHD, "UHD", 1397.6),
  red("red-vr-8k-hq", "V-RAPTOR [X] 8K 17:9 REDCODE HQ", ["8k", "8k179"], 425),
  red("red-vr-8k-mq", "V-RAPTOR [X] 8K 17:9 REDCODE MQ", ["8k", "8k179"], 298),
  red("red-vr-8k-lq", "V-RAPTOR [X] 8K 17:9 REDCODE LQ", ["8k", "8k179"], 186),
  red("red-vr-8k-elq", "V-RAPTOR [X] 8K 17:9 REDCODE ELQ", ["8k", "8k179"], 100),
  red("red-vr-6k-hq", "V-RAPTOR [X] 6K 17:9 REDCODE HQ", ["6k", "6k179"], 239),
  red("red-vr-6k-mq", "V-RAPTOR [X] 6K 17:9 REDCODE MQ", ["6k", "6k179"], 168),
  red("red-vr-6k-lq", "V-RAPTOR [X] 6K 17:9 REDCODE LQ", ["6k", "6k179"], 105),
  red("red-vr-6k-elq", "V-RAPTOR [X] 6K 17:9 REDCODE ELQ", ["6k", "6k179"], 65),
  arri("arri-lf-raw", "ALEXA LF Open Gate 4448x3096 ARRIRAW", ["alexalf", "arrialexalf", "alexaminilf", "arrialexaminilf"], ["ARRIRAW"], ["4448x3096", "opengate"], 20.9, "20,9 MB per frame x 24 fps (ARRI: 1,80 TB per jam)."),
  arri("arri-lf-hde", "ALEXA LF Open Gate 4448x3096 ARRIRAW HDE", ["alexalf", "arrialexalf", "alexaminilf", "arrialexaminilf"], ["ARRIRAW HDE", "ARRIRAW-HDE"], ["4448x3096", "opengate"], 12.5, "12,5 MB per frame x 24 fps (ARRI: 1,08 TB per jam)."),
  arri("arri-sxt-raw", "ALEXA SXT Open Gate 3424x2202 ARRIRAW", ["alexasxt", "arrialexasxt"], ["ARRIRAW"], ["3424x2202", "opengate"], 11.5, "11,5 MB per frame x 24 fps (ARRI: 996 GB per jam)."),
  arri("arri-sxt-hde", "ALEXA SXT Open Gate 3424x2202 ARRIRAW HDE", ["alexasxt", "arrialexasxt"], ["ARRIRAW HDE", "ARRIRAW-HDE"], ["3424x2202", "opengate"], 6.9, "6,9 MB per frame x 24 fps (ARRI: 598 GB per jam)."),
];

/** Project rows (ids "p-…") replace built-in rows with the same id and are otherwise appended. */
export function mergeRates(builtIn: RateRow[], project: RateRow[]): RateRow[] {
  const over = new Map(project.map((r) => [r.id, r]));
  return [...builtIn.map((r) => over.get(r.id) ?? r), ...project.filter((r) => !builtIn.some((b) => b.id === r.id))];
}

/** Exact alias matching after norm(). 3 = model+format+res, 2 = model+format, 1 = codec-only row whose format matches and res matches or is empty. */
export function matchRates(rows: RateRow[], q: { model?: string; format?: string; res?: string }): { row: RateRow; score: 1 | 2 | 3 }[] {
  const m = norm(q.model ?? ""), f = norm(q.format ?? ""), r = norm(q.res ?? "");
  if (!f) return [];
  const out: { row: RateRow; score: 1 | 2 | 3 }[] = [];
  for (const row of rows) {
    if (!row.formats.map(norm).includes(f)) continue;
    const resOk = !!r && row.res.map(norm).includes(r);
    if (row.models.length === 0) { if (!r || row.res.length === 0 || resOk) out.push({ row, score: 1 }); continue; }
    if (m && row.models.map(norm).includes(m)) out.push({ row, score: resOk ? 3 : 2 });
  }
  return out.sort((a, b) => b.score - a.score);
}

/** The row to auto-select: only when exactly one row has the top score. */
export function autoRate(rows: RateRow[], q: { model?: string; format?: string; res?: string }): RateRow | null {
  const ms = matchRates(rows, q);
  if (!ms.length) return null;
  const top = ms.filter((x) => x.score === ms[0].score);
  return top.length === 1 ? top[0].row : null;
}
