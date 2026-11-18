/**
 * Feedback import: pasted text, delimited files, EDL marker files. Pure; also runs in the browser.
 * Format sources (see tests/fixtures/markers/):
 *  - Resolve marker EDL (verified sample): https://github.com/zekroTJA/chapterize (README), Resolve "Timelines > Export > Timeline Markers to EDL"
 *  - Premiere marker export (File > Export > Markers; tab-delimited, UTF-16LE or UTF-8 BOM; columns Marker Name, Description, In, Out, Duration, Marker Type):
 *    https://community.adobe.com/questions-729/premiere-pro-marker-exports-csv-to-single-column-1621573 , https://larryjordan.com/articles/export-chapter-marker-list-from-adobe-premiere-pro/
 *  - Avid "Export Markers as Text" (tab-delimited .txt, no header): https://resources.avid.com/SupportFiles/attach/Interplay_Central/IPC_Help/InterplayCentral_Help/UG_Logging.20.14.html
 *  - Frame.io comment CSV: https://help.frame.io/en/articles/9105309-comment-printing-and-comment-exporting
 *  - Vimeo review CSV: https://vimeo.com/product-updates
 * Column layouts of Frame.io, Vimeo, Avid and Resolve CSV could not be verified from a real file; detection is by header names and the user can remap.
 */
import { parseEdl } from "../edl/edl";

export type Incoming = { ref: string; body: string; fromWho: string; dup?: boolean };

const BULLET = /^\s*(?:[-*•–]\s+|\d+[.)]\s+)/;
const BRACKET = /^\[([^\]]{1,40})\]\s*/;
const TIMECODE = /^(\d{1,2}:\d{2}(?::\d{2}){0,2}(?:[:;]\d{2})?)(?!\s*[ap]\.?m\b)\s+/i;
const DATE = String.raw`\d{1,2}[/.]\d{1,2}[/.]\d{2,4}`;
const CLOCK = String.raw`\d{1,2}[.:]\d{2}(?:[.:]\d{2})?(?:\s?[AaPp][Mm])?`;
const WA = [new RegExp(String.raw`^\[${DATE},?\s+${CLOCK}\]\s*([^:]+?):\s*(.*)$`), new RegExp(String.raw`^${DATE},?\s+${CLOCK}\s+-\s+([^:]+?):\s*(.*)$`)];
const AUTHOR = /^([A-ZÀ-Ý][\p{L}.'-]*(?: [\p{L}.'-]+){0,2}):\s+(\S.*)$/u;

/** A new point starts on a timecode, bullet, numbering, [pointer] or WhatsApp prefix; other lines continue the previous point. */
export function parseFeedbackText(text: string): Incoming[] {
  const out: Incoming[] = [];
  for (const raw of text.replace(/^﻿/, "").split(/\r\n|\r|\n/)) {
    const line = raw.trim();
    if (!line) continue;
    const wa = WA.map((re) => line.match(re)).find(Boolean);
    const stripped = line.replace(BULLET, "");
    const m = !wa && (stripped.match(BRACKET) ?? stripped.match(TIMECODE));
    if (!wa && !m && stripped === line && out.length) {
      out[out.length - 1].body += "\n" + line;
      continue;
    }
    let who = wa ? wa[1].trim() : "";
    let rest = (wa ? wa[2] : stripped).trim();
    let ref = "";
    const t = rest.match(BRACKET) ?? rest.match(TIMECODE);
    if (t && rest.length > t[0].length) { ref = t[1].trim(); rest = rest.slice(t[0].length).trim(); }
    if (!wa) {
      const a = rest.match(AUTHOR);
      if (a) {
        who = a[1]; rest = a[2].trim();
        const t2 = !ref && (rest.match(BRACKET) ?? rest.match(TIMECODE));
        if (t2 && rest.length > t2[0].length) { ref = t2[1].trim(); rest = rest.slice(t2[0].length).trim(); }
      }
    }
    if (rest) out.push({ ref, body: rest, fromWho: who });
  }
  return out;
}

/** RFC 4180 with quoted newlines; the delimiter (tab, semicolon or comma) is guessed from the first line. */
export function parseDelimited(text: string): string[][] {
  const src = text.replace(/^﻿/, "");
  const first = src.split(/\r\n|\r|\n/)[0] ?? "";
  const n = (c: string) => first.split(c).length - 1;
  const d = n("\t") ? "\t" : n(";") > n(",") ? ";" : ",";
  const rows: string[][] = [];
  let row: string[] = [], cell = "", q = false;
  for (let i = 0; i < src.length; i++) {
    const c = src[i];
    if (q) {
      if (c === '"') { if (src[i + 1] === '"') { cell += '"'; i++; } else q = false; } else cell += c;
    } else if (c === '"' && !cell) q = true;
    else if (c === d) { row.push(cell); cell = ""; }
    else if (c === "\n" || c === "\r") {
      if (c === "\r" && src[i + 1] === "\n") i++;
      row.push(cell); cell = ""; rows.push(row); row = [];
    } else cell += c;
  }
  if (cell || row.length) { row.push(cell); rows.push(row); }
  return rows.filter((r) => r.some((c) => c.trim()));
}

export type Mapping = { ref: number | null; body: number; author: number | null; format: string };

const SIGS: { format: string; ref: string[]; body: string[]; author: string[]; need?: string }[] = [
  { format: "Premiere Pro", need: "marker name", ref: ["in"], body: ["description"], author: [] },
  { format: "Resolve CSV", need: "timecode in", ref: ["timecode in"], body: ["notes", "marker name", "name"], author: [] },
  // Timecode before Frame: Frame.io may export both, the frame number is never used.
  { format: "Frame.io", ref: ["timecode", "timecode in", "timecode source"], body: ["comment", "comment text", "text"], author: ["commenter", "author", "owner", "name"] },
  { format: "Vimeo", ref: ["time", "timestamp", "timecode"], body: ["comment", "text", "note"], author: ["name", "user", "author", "commenter"] },
];
const TC_CELL = /^\d{1,2}:\d{2}(?::\d{2}){0,2}(?:[:;]\d{2})?$/;

/** Mapping for a header row, or for the first row of a headerless Avid marker .txt; null when unknown. */
export function detectMapping(header: string[]): Mapping | null {
  const h = header.map((c) => c.trim().toLowerCase());
  const at = (names: string[]) => { const i = h.findIndex((c) => names.includes(c)); return i < 0 ? null : i; };
  for (const s of SIGS) {
    if (s.need && !h.includes(s.need)) continue;
    const body = at(s.body);
    if (body === null || (!s.need && at(s.ref) === null)) continue;
    return { format: s.format, ref: at(s.ref), body, author: at(s.author) };
  }
  if (header.length >= 5 && TC_CELL.test(h[1])) return { format: "Avid", ref: 1, body: 4, author: 0 };
  return null;
}

/** Rows after the header; Avid text files have none. */
export const dataRows = (rows: string[][], m: Mapping | null) => (m?.format === "Avid" ? rows : rows.slice(1));

export function rowsToIncoming(rows: string[][], m: Mapping): Incoming[] {
  const cell = (r: string[], i: number | null) => (i === null ? "" : (r[i] ?? "").trim());
  return rows
    .map((r) => ({ ref: cell(r, m.ref), body: cell(r, m.body), fromWho: cell(r, m.author) }))
    .filter((p) => p.body);
}

/** EDL with markers (Resolve `|M:`, Avid/Premiere `* LOC:`): record-in becomes the ref. */
export function fromEdl(text: string): Incoming[] {
  return parseEdl(text).events
    .map((e) => ({ ref: e.recIn, body: e.locator || e.comments.join(" "), fromWho: "" }))
    .filter((p) => p.body);
}

const norm = (s: string) => s.toLowerCase().replace(/\s+/g, " ").trim();
export const dedupeKey = (p: { ref: string; body: string }) => `${norm(p.ref)}|${norm(p.body)}`;

/** Flags points already present, and repeats within the batch (the first one is kept). */
export function markDuplicates(existing: { ref: string; body: string }[], incoming: Incoming[]): Incoming[] {
  const seen = new Set(existing.map(dedupeKey));
  return incoming.map((p) => {
    const k = dedupeKey(p);
    const dup = seen.has(k);
    seen.add(k);
    return { ...p, dup };
  });
}

/** File bytes to text: UTF-16 (Premiere) by BOM, else UTF-8. */
export function decodeText(buf: ArrayBuffer): string {
  const b = new Uint8Array(buf);
  const enc = b[0] === 0xff && b[1] === 0xfe ? "utf-16le" : b[0] === 0xfe && b[1] === 0xff ? "utf-16be" : "utf-8";
  return new TextDecoder(enc).decode(b);
}
