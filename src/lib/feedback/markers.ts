/**
 * Marker exporters, one per format. Pure; the dialog and the route share them.
 * Sources:
 *  - Resolve EDL (marker lines " |C:ResolveColorBlue |M:name |D:1", imported via Timelines > Import > Timeline Markers from EDL):
 *    verified sample https://github.com/zekroTJA/chapterize (README); import path https://edl-importer-docs.pages.dev/resolve-markers
 *  - Premiere marker list (tab-delimited, columns Marker Name, Description, In, Out, Duration, Marker Type): https://community.adobe.com/t5/premiere-pro-discussions/how-to-export-markers-with-names-and-comments/m-p/15084212
 *    Premiere has no native marker CSV import; this is a spreadsheet list in its own export layout.
 *  - Avid marker text (tab-delimited: user, timecode, track, colour, comment, duration; native import in the Marker tool):
 *    https://resources.avid.com/SupportFiles/attach/Interplay_Central/IPC_Help/InterplayCentral_Help/UG_Logging.20.14.html (layout not verified from a real file)
 *  - EDL with `* LOC:` locators (Avid/Premiere style): same CMX3600 shape as src/lib/edl/edl.ts toEdl; app import unverified.
 *  - FCPXML <marker start duration value> inside a spine clip, rational times, tcFormat DF|NDF:
 *    https://developer.apple.com/documentation/professional-video-applications/describing-final-cut-pro-items-in-fcpxml
 */
import { framesToTc, secondsToFrames, tcToFrames, type Rate } from "../timecode";
import { toCsv } from "../schedule/csv";

export type MarkerPoint = { ref: string; body: string; fromWho: string };
export type MarkerOptions = { rate: Rate; start: string; mode: "offset" | "absolute"; name: string };
export type MarkerResult = { text: string; skipped: number };
export type MarkerFormat = { id: string; label: string; ext: string; mime: string; bom: boolean; make: (p: MarkerPoint[], o: MarkerOptions) => MarkerResult };

const REF = /(?<!\d)(\d{1,2}(?::\d{2}){1,2}(?:[:;]\d{2})?)(?![\d:;]|\s*[ap]\.?m\b)/i;
const label = (p: MarkerPoint) => (p.fromWho ? `${p.body} (${p.fromWho})` : p.body).replace(/\s+/g, " ").trim();

/** Frame numbers on the timeline for the points that have a timecode; the rest are counted as skipped. */
function place(points: MarkerPoint[], o: MarkerOptions) {
  const base = o.mode === "offset" ? (tcToFrames(o.start, o.rate) ?? 0) : 0;
  const placed: { p: MarkerPoint; frame: number }[] = [];
  let skipped = 0;
  for (const p of points) {
    const t = p.ref.match(REF)?.[1];
    let f: number | null = null;
    if (t) {
      const parts = t.split(/[:;]/).map(Number);
      if (parts.length === 4) f = tcToFrames(t, o.rate); // frames field: a timecode at this rate
      else if (o.mode === "offset") f = secondsToFrames(parts.length === 3 ? parts[0] * 3600 + parts[1] * 60 + parts[2] : parts[0] * 60 + parts[1], o.rate);
      else f = tcToFrames(parts.length === 3 ? `${t}:00` : `00:${t}:00`, o.rate);
    }
    if (f === null) { skipped++; continue; }
    placed.push({ p, frame: base + f });
  }
  return { placed: placed.sort((a, b) => a.frame - b.frame), skipped };
}

const tc = (f: number, o: MarkerOptions) => framesToTc(f, o.rate);
const header = (o: MarkerOptions) => `TITLE: ${o.name.replace(/\s+/g, " ")}\nFCM: ${o.rate.drop ? "DROP FRAME" : "NON-DROP FRAME"}\n`;
const num = (i: number) => String(i + 1).padStart(3, "0");

const resolveEdl: MarkerFormat["make"] = (points, o) => {
  const { placed, skipped } = place(points, o);
  const ev = placed.map(({ p, frame }, i) => `${num(i)}  001      V     C        ${tc(frame, o)} ${tc(frame + 1, o)} ${tc(frame, o)} ${tc(frame + 1, o)}  \n |C:ResolveColorBlue |M:${label(p).replace(/\|/g, "/")} |D:1\n`);
  return { text: [header(o), ...ev].join("\n"), skipped };
};

const locEdl: MarkerFormat["make"] = (points, o) => {
  const { placed, skipped } = place(points, o);
  const ev = placed.map(({ p, frame }, i) => `${num(i)}  AX       V     C        ${tc(frame, o)} ${tc(frame + 1, o)} ${tc(frame, o)} ${tc(frame + 1, o)}\n* LOC: ${tc(frame, o)} RED     ${label(p)}\n`);
  return { text: [header(o), ...ev].join("\n").replace(/\n/g, "\r\n"), skipped };
};

const tsv = (rows: string[][]) => !rows.length ? "" : rows.map((r) => r.map((c) => c.replace(/[\t\r\n]+/g, " ")).join("\t")).join("\r\n") + "\r\n";

const premiereCsv: MarkerFormat["make"] = (points, o) => {
  const { placed, skipped } = place(points, o);
  const z = tc(0, o);
  return { text: tsv([["Marker Name", "Description", "In", "Out", "Duration", "Marker Type"], ...placed.map(({ p, frame }) => [label(p).slice(0, 60), p.body, tc(frame, o), tc(frame, o), z, "Comment"])]), skipped };
};

const resolveCsv: MarkerFormat["make"] = (points, o) => {
  const { placed, skipped } = place(points, o);
  return { text: toCsv([["Marker Name", "Notes", "Timecode In", "Marker Color", "Duration"], ...placed.map(({ p, frame }) => [label(p).slice(0, 60), p.body, tc(frame, o), "Blue", "1"])]), skipped };
};

const avidTxt: MarkerFormat["make"] = (points, o) => {
  const { placed, skipped } = place(points, o);
  return { text: tsv(placed.map(({ p, frame }) => [p.fromWho || "Post System", tc(frame, o), "V1", "red", p.body, "1"])), skipped };
};

const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

/** Rational seconds for a frame count: 1001/(base*1000) per frame at NTSC rates. */
const time = (n: number, r: Rate) => (n === 0 ? "0s" : Math.abs(r.fps - r.base) > 1e-6 ? `${n * 1001}/${r.base * 1000}s` : `${n}/${r.base}s`);

const fcpxml: MarkerFormat["make"] = (points, o) => {
  const { placed, skipped } = place(points, o);
  const r = o.rate;
  const startF = o.mode === "offset" ? (tcToFrames(o.start, r) ?? 0) : 0;
  const first = Math.min(startF, ...placed.map((x) => x.frame));
  const end = Math.max(startF + 1, ...placed.map((x) => x.frame + 1));
  const marks = placed.map(({ p, frame }) => `          <marker start="${time(frame, r)}" duration="${time(1, r)}" value="${esc(label(p))}"/>`).join("\n");
  const text = `<?xml version="1.0" encoding="UTF-8"?>
<fcpxml version="1.10">
  <resources>
    <format id="r1" name="Post System" frameDuration="${time(1, r)}"/>
  </resources>
  <project name="${esc(o.name)}">
    <sequence format="r1" tcStart="${time(startF, r)}" tcFormat="${r.drop ? "DF" : "NDF"}" duration="${time(end - first, r)}">
      <spine>
        <gap name="Feedback" offset="0s" start="${time(first, r)}" duration="${time(end - first, r)}">
${marks}
        </gap>
      </spine>
    </sequence>
  </project>
</fcpxml>
`;
  return { text, skipped };
};

export const MARKER_FORMATS: MarkerFormat[] = [
  { id: "resolve-edl", label: "DaVinci Resolve: EDL marker", ext: "edl", mime: "text/plain", bom: false, make: resolveEdl },
  { id: "resolve-csv", label: "DaVinci Resolve: CSV, daftar (untuk spreadsheet)", ext: "csv", mime: "text/csv", bom: true, make: resolveCsv },
  { id: "premiere-csv", label: "Premiere Pro: CSV, daftar (untuk spreadsheet)", ext: "csv", mime: "text/csv", bom: true, make: premiereCsv },
  { id: "premiere-edl", label: "Premiere Pro: EDL", ext: "edl", mime: "text/plain", bom: false, make: locEdl },
  { id: "avid-txt", label: "Avid Media Composer: marker .txt", ext: "txt", mime: "text/plain", bom: false, make: avidTxt },
  { id: "avid-edl", label: "Avid Media Composer: EDL", ext: "edl", mime: "text/plain", bom: false, make: locEdl },
  { id: "fcpxml", label: "Final Cut Pro: FCPXML", ext: "fcpxml", mime: "application/xml", bom: false, make: fcpxml },
];
