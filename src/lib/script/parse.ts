import { InputError } from "../services";
import { suggestTags } from "./tags";
import { placeOf, REVISION_MARK, type ParsedCharacter, type ParsedScene, type PdfPage } from "./types";

const LINES_PER_PAGE = 55;
const SECONDS_PER_PAGE = 60;

// ---------- headings ----------

const TIME_WORDS: Record<string, string> = {
  DAY: "SIANG", SIANG: "SIANG", NOON: "SIANG", NIGHT: "MALAM", MALAM: "MALAM", MORNING: "PAGI", PAGI: "PAGI",
  EVENING: "SORE", AFTERNOON: "SORE", SORE: "SORE", PETANG: "SORE", SENJA: "SORE", DUSK: "SORE", SUNSET: "SORE",
  DAWN: "SUBUH", SUBUH: "SUBUH", FAJAR: "SUBUH", SUNRISE: "SUBUH", DINI: "SUBUH",
  LATER: "LAINNYA", CONTINUOUS: "LAINNYA", KEMUDIAN: "LAINNYA", LANJUTAN: "LAINNYA", MONTAGE: "LAINNYA", SAMA: "LAINNYA", MOMENTS: "LAINNYA",
};
const TW = Object.keys(TIME_WORDS).join("|");
// One or more time words ("SIANG LANJUTAN", "DINI HARI", "MALAM HARI"), optionally two joined by - / & DAN AND, optional "(...)".
const TIME_PHRASE = String.raw`(?:${TW})(?:\s+(?:${TW}|HARI|THAT|LATER|SAMA))*`;
const TIME_AT_END = new RegExp(String.raw`^(.*?)(?:\s*[-–—.,/]+\s*|\s+)(${TIME_PHRASE}(?:\s*(?:[-–—/&]|DAN|AND)\s*${TIME_PHRASE})?)(?:\s*\([^)]*\))?\s*$`, "i");
const BARE_TIME = new RegExp(String.raw`^(${TIME_PHRASE})(?:\s*\([^)]*\))?$`, "i");

const IE = String.raw`(?:INT|DLM|DALAM)\.?\s*[/.\-]\s*(?:EXT|EKS|LUAR)\.?|(?:EXT|EKS|LUAR)\.?\s*[/.\-]\s*(?:INT|DLM|DALAM)\.?|I\s*/\s*E\.?|INT|EXT|EKS|DLM|DALAM|LUAR`;
const HEAD = new RegExp(String.raw`^(?:(?:SC|SCN|SCENE|ADEGAN|ADG)\.?\s*)?(?:(\d+(?:-?[A-Z]{1,2})?)\s*[.:)\-–]?\s+)?(${IE})(?=[\s.\-–—]|$)\.?\s*(.*)$`, "i");
// Scene modifiers: split off the location; the time of day is inherited from the previous scene when none is given.
const MOD = String.raw`(?:BEBERAPA SAAT KEMUDIAN|SEDETIK KEMUDIAN|MOMENTS? LATER|ANOTHER ANGLE|SUDUT LAIN|SAME TIME|CONTINUOUS|MEANWHILE|LANJUTAN|LATER|SAMA|SAME)`;
const MOD_END = new RegExp(String.raw`^(.*?)(?:\s*[-–—.,/]+\s*|\s+|^)(${MOD})\s*$`, "i");
function peel(s: string): { s: string; mod: boolean } {
  let mod = false, m: RegExpExecArray | null;
  while ((m = MOD_END.exec(s))) {
    s = m[1].trim();
    mod = true;
  }
  return { s, mod };
}
const LEAD = /^(?:(?:SC|SCN|SCENE|ADEGAN|ADG)\.?\s*)?\d+(?:-?[A-Z]{1,2})?\s*[.:)\-–]?\s+/i;
const TRAIL = /\s+(?:(?:SC|SCN|SCENE|ADEGAN|ADG)\.?\s*)?\d+(?:-?[A-Z]{1,2})?\.?$/i;
const TRAIL_NUM = /^(.*\S)\s+(?:(?:SC|SCN|SCENE|ADEGAN|ADG)\.?\s*)?(\d+(?:-?[A-Z]{1,2})?)\.?$/i;

function intExt(prefix: string): string {
  const p = prefix.toUpperCase().replace(/\s+/g, "");
  if (/^I\/E/.test(p)) return "INT/EXT";
  const hasInt = /INT|DLM|DALAM/.test(p), hasExt = /EXT|EKS|LUAR/.test(p);
  return hasInt && hasExt ? "INT/EXT" : hasInt ? "INT" : "EXT";
}

const normTime = (phrase: string) => {
  for (const w of phrase.toUpperCase().split(/[^A-Z]+/)) {
    const t = TIME_WORDS[w];
    if (t && t !== "LAINNYA") return t;
  }
  return "LAINNYA";
};

export type Heading = { heading: string; number: string; intExt: string; location: string; place: string; timeOfDay: string; /** Ends in a modifier such as MOMENTS LATER / ANOTHER ANGLE / CONTINUOUS. */ modifier: boolean };

/** Parses one line as a scene heading (English or Indonesian), or returns null. */
export function parseHeading(raw: string): Heading | null {
  const line = raw.replace(REVISION_MARK, " ").replace(/\s+/g, " ").trim();
  const m = HEAD.exec(line);
  if (!m) return null;
  const [, lead, prefix] = m;
  let rest = m[3].trim();
  if (/^(DALAM|LUAR)$/i.test(prefix.trim()) || /^(DALAM|LUAR)\b/i.test(prefix)) {
    if (/[a-z]/.test(line)) return null; // "Dalam kegelapan, ..." is prose
  }
  if (!rest && !/[./]/.test(prefix)) return null; // bare "INT" or "EKS" is not a heading
  if (rest.length > 120 || /[a-z]{4,}\s+[a-z]{4,}\s+[a-z]{4,}/.test(rest)) return null; // lowercase prose
  let number = lead ?? "";
  // The heading as shown keeps INT/EXT, location and time, without the scene numbers printed in the margins.
  let heading = lead ? line.replace(LEAD, "") : line;
  const tn = TRAIL_NUM.exec(rest);
  if (tn && (number ? tn[2].toUpperCase() === number.toUpperCase() : TIME_AT_END.test(tn[1]) || peel(tn[1]).mod)) {
    number = number || tn[2];
    rest = tn[1].trim();
    heading = heading.replace(TRAIL, "");
  }
  let timeOfDay = "";
  const pm = peel(rest);
  rest = pm.s;
  let location = rest;
  const t = TIME_AT_END.exec(rest);
  if (t) {
    location = t[1];
    timeOfDay = normTime(t[2]);
  } else if (BARE_TIME.test(rest)) {
    location = "";
    timeOfDay = normTime(rest);
  }
  if (pm.mod && !timeOfDay) timeOfDay = "LAINNYA";
  location = location.replace(/[\s\-–—.,/]+$/, "").replace(/^[\s\-–—.,/]+/, "").replace(/\s+/g, " ").toUpperCase();
  return { heading, number: number.toUpperCase(), intExt: intExt(prefix), location, place: placeOf(location), timeOfDay, modifier: pm.mod };
}

// ---------- cues ----------

const EXT_GROUPS = /\([^)]*\)/g;

/** "BUDI (V.O.)", "Sari (CONT'D)", "BUDI:" -> "BUDI". Returns "" when the line cannot be a character name. */
export function normalizeCue(raw: string): string {
  const name = raw.replace(REVISION_MARK, " ").replace(EXT_GROUPS, " ").replace(/\^/g, "").replace(/\s*(?:CONT['’]?D|LANJUT)\.?\s*$/i, "").replace(/[:.\s]+$/, "").replace(/\s+/g, " ").trim().toUpperCase();
  return /[A-Z]/.test(name) && name.length <= 40 ? name : "";
}

const INSTR = String.raw`(?:TITLE(?:\s+IN)?|SUPER|TEKS|INSERT|CUT\s+TO|INTERCUT(?:\s+WITH)?)`;
const INSTR_RE = new RegExp(String.raw`^${INSTR}\b\s*(?:[:\-]\s*(.+))?$`);
/** Character names behind one cue line: "ALI, DUDUNG" -> two names; "TITLE IN : ALI" -> ALI; "SUPER" / "CUT TO" -> none. */
export function cueNames(raw: string): string[] {
  const full = normalizeCue(raw);
  const ins = INSTR_RE.exec(full);
  const body = ins ? ins[1] ?? "" : full;
  return body.split(/\s*(?:,|&|\bDAN\b|\bAND\b)\s*/).map((n) => n.trim()).filter((n) => /[A-Z]/.test(n));
}

const isUpper = (s: string) => /[A-Z]/.test(s) && !/[a-z]/.test(s);
const cueExtension = (raw: string) => (raw.match(EXT_GROUPS) ?? []).join(" ") + (/\s(?:CONT['’]?D|LANJUT)\.?$/i.test(raw) ? " (CONT'D)" : "");
const TRANSITION = /^(?:(?:FADE|CUT|DISSOLVE|SMASH CUT|MATCH CUT|WIPE|IRIS|POTONG|BERALIH|MEMUDAR|PUDAR|SAMBUNG)\b.*|.*\b(?:TO|KE)):?\.?$/;
const isTransition = (t: string) => isUpper(t) && t.length <= 30 && TRANSITION.test(t) && /(?:[:.]$|\bTO:?$|\bKE:?$|^FADE|^CUT)/.test(t);

const OMITTED = /^(?:(\d+(?:-?[A-Z]{1,2})?)\s+)?OMITTED(?:\s+(\d+(?:-?[A-Z]{1,2})?))?$/i;

// ---------- layout ----------

type Row = { page: number; y: number; x: number; text: string; head: Heading | null };

const bucket = (x: number) => Math.round(x / 3);
function mode(xs: number[]): number | undefined {
  const c = new Map<number, number>();
  for (const x of xs) c.set(bucket(x), (c.get(bucket(x)) ?? 0) + 1);
  let best: [number, number] | undefined;
  for (const e of c) if (!best || e[1] > best[1]) best = e;
  return best && xs.filter((x) => bucket(x) === best![0]).reduce((a, b) => a + b, 0) / best[1];
}

export type Layout = { action: number; cue?: number; dialogue?: number; tol: number };

/** Finds the action margin, cue indent and dialogue indent from the x histogram of the document itself. */
export function detectLayout(rows: Row[]): Layout {
  const body = rows.filter((r) => !r.head);
  const counts = new Map<number, number>();
  for (const r of body) counts.set(bucket(r.x), (counts.get(bucket(r.x)) ?? 0) + 1);
  const left = [...counts].filter(([, n]) => n >= body.length * 0.1).map(([b]) => b).sort((a, b) => a - b)[0] ?? bucket(Math.min(...body.map((r) => r.x)));
  const action = mode(body.filter((r) => bucket(r.x) === left).map((r) => r.x)) ?? 0;
  const tol = 9;
  const cand = body.map((r, i) => ({ r, i })).filter(({ r }) => r.x >= action + 18 && isUpper(r.text) && r.text.length <= 45 && !isTransition(r.text) && !/^\(/.test(r.text));
  const cue = mode(cand.map(({ r }) => r.x));
  const dlg = cue == null ? [] : cand.filter(({ r }) => Math.abs(r.x - cue) <= tol).map(({ i }) => body[i + 1]).filter((n) => n && n.x > action + tol && !/^\(/.test(n.text)).map((n) => n.x);
  return { action, cue, dialogue: mode(dlg), tol };
}

/** Classifies every row after the first heading and builds scenes. */
export function parseScreenplay(pages: PdfPage[]): { scenes: ParsedScene[]; pages: number; warnings: string[] } {
  const rows: Row[] = [];
  for (const p of pages) for (const l of p.lines) if (!l.skip) rows.push({ page: p.page, y: l.y, x: l.x, text: l.text, head: parseHeading(l.text) });
  if (rows.length < 5) throw new InputError("Naskah tidak dikenali: PDF hampir tidak berisi teks (mungkin hasil scan). Gunakan PDF yang teksnya bisa diseleksi.");
  const first = rows.findIndex((r) => r.head);
  if (first < 0) throw new InputError("Naskah tidak dikenali: tidak ada judul adegan (INT./EXT., DLM./LUAR) yang ditemukan.");
  const body = rows.slice(first);
  const omitted: string[] = [];
  const layout = detectLayout(body);
  const near = (x: number, ref?: number) => ref != null && Math.abs(x - ref) <= layout.tol;

  // vertical scale: document-wide top and bottom of content, median line pitch for blank-line detection
  const ys = body.map((r) => r.y);
  const top = Math.max(...ys), bottom = Math.min(...ys);
  const pitches: number[] = [];
  for (let i = 1; i < body.length; i++) if (body[i].page === body[i - 1].page) pitches.push(body[i - 1].y - body[i].y);
  const pitch = pitches.sort((a, b) => a - b)[Math.floor(pitches.length * 0.4)] || 12;
  const frac = (r: Row) => Math.min(1, Math.max(0, (top - r.y) / (top - bottom || 1)));

  type Acc = { head: Heading; rows: Row[]; blocks: Map<string, number>; lastSpeaker: string; lastKind: string; cues: string[] };
  const accs: Acc[] = [];
  let cur: Acc | undefined;
  let inDialogue = false;
  for (const r of body) {
    const om = OMITTED.exec(r.text);
    if (om) {
      omitted.push((om[1] ?? om[2] ?? "").toUpperCase());
      continue;
    }
    if (r.head) {
      cur = { head: r.head, rows: [r], blocks: new Map(), lastSpeaker: "", lastKind: "heading", cues: [] };
      accs.push(cur);
      inDialogue = false;
      continue;
    }
    cur!.rows.push(r);
    const t = r.text;
    const isCue = layout.cue != null && near(r.x, layout.cue) && isUpper(t.replace(EXT_GROUPS, "")) && t.length <= 45 && !isTransition(t) && cueNames(t).length > 0;
    let kind: string;
    if (isCue) {
      kind = "cue";
      const names = cueNames(t), name = names.join("|");
      cur!.cues.push(t);
      // "BUDI (CONT'D)" straight after a page break, with no action in between, continues the same block.
      const continued = /CONT|LANJUT/i.test(cueExtension(t)) && cur!.lastKind === "dialogue" && cur!.lastSpeaker === name;
      if (!continued) for (const n of names) cur!.blocks.set(n, (cur!.blocks.get(n) ?? 0) + 1);
      cur!.lastSpeaker = name;
      inDialogue = true;
    } else if (isTransition(t) && (r.x > (layout.cue ?? layout.action) + layout.tol || r.x <= layout.action + layout.tol)) kind = "transition";
    else if (inDialogue && /^\(/.test(t) && r.x > layout.action + layout.tol) kind = "parenthetical";
    else if (near(r.x, layout.dialogue) || (inDialogue && r.x > layout.action + layout.tol && layout.dialogue != null && r.x < (layout.cue ?? Infinity) - layout.tol)) kind = "dialogue";
    else {
      kind = "action";
      inDialogue = false;
    }
    if (kind === "transition" || kind === "action") inDialogue = false;
    cur!.lastKind = kind;
  }

  const anyNumber = accs.some((a) => a.head.number);
  const warnings: string[] = [];
  let prevTime = "";
  const scenes: ParsedScene[] = accs.map((a, i) => {
    const h = { ...a.head };
    if (h.modifier && (!h.timeOfDay || h.timeOfDay === "LAINNYA") && prevTime) h.timeOfDay = prevTime;
    if (h.timeOfDay && h.timeOfDay !== "LAINNYA") prevTime = h.timeOfDay;
    const lines = a.rows.reduce((n, r, k) => n + 1 + (k && a.rows[k - 1].page === r.page && a.rows[k - 1].y - r.y > pitch * 1.5 ? 1 : 0), 1);
    const start = a.rows[0], end = a.rows[a.rows.length - 1];
    const ps = start.page + Math.floor(frac(start) * 8) / 8;
    const pe = Math.max(ps, end.page + Math.ceil(frac(end) * 8) / 8);
    const characters: ParsedCharacter[] = [...a.blocks].map(([name, blocks]) => ({ name, blocks }));
    return {
      position: i + 1, number: h.number || String(i + 1), heading: h.heading.slice(0, 200), intExt: h.intExt, location: h.location, place: h.place, timeOfDay: h.timeOfDay,
      pageStart: ps, pageEnd: pe, lines, estSeconds: Math.round((lines / LINES_PER_PAGE) * SECONDS_PER_PAGE), characters, postTags: suggestTags(a.rows.map((r) => r.text), a.cues),
    };
  });
  const noNumber = anyNumber ? accs.filter((a) => !a.head.number).length : 0;
  if (noNumber) warnings.push(`${noNumber} adegan tanpa nomor diberi nomor urut otomatis.`);
  const dup = scenes.find((s, i) => scenes.findIndex((x) => x.number === s.number) !== i);
  if (dup) warnings.push(`Nomor adegan ganda: ${dup.number}.`);
  const omittedNums = omitted.filter(Boolean);
  if (omittedNums.length) warnings.push(`${omittedNums.length} adegan OMITTED: ${omittedNums.join(", ")}`);
  const printed = new Set([...scenes.filter((_, i) => accs[i].head.number).map((x) => x.number.toUpperCase()), ...omittedNums]);
  const ints = [...printed].map((n) => parseInt(n, 10)).filter((n) => n > 0);
  if (ints.length) {
    const lo = Math.min(...ints), hi = Math.max(...ints);
    const missing: number[] = [];
    for (let n = lo; n <= hi; n++) if (![...printed].some((p) => parseInt(p, 10) === n)) missing.push(n);
    if (missing.length) warnings.push(`nomor adegan terlewat: ${missing.slice(0, 40).join(", ")}${missing.length > 40 ? ", ..." : ""}`);
  }
  const noTime = scenes.filter((s) => !s.timeOfDay).length;
  if (noTime) warnings.push(`${noTime} adegan tanpa keterangan waktu.`);
  if (!scenes.some((s) => s.characters.length)) warnings.push("Tidak ada dialog terdeteksi. Tokoh tidak bisa dihitung; periksa tata letak naskah.");
  return { scenes, pages: pages.length, warnings };
}
