// Plain types and tiny helpers shared by the parser, the service and the UI. No imports, safe in client components.

export type PdfLine = { y: number; x: number; text: string; /** page number, "CONTINUED", "(MORE)": not content. */ skip?: boolean };
export type PdfPage = { page: number; height: number; lines: PdfLine[] };

/** A standalone Final Draft revision mark ("*") at the margin or between words. */
export const REVISION_MARK = /(^|\s)\*+(?=\s|$)/g;

/** One paragraph of a scene in reading order. `cue` = character name (normalised), `ext` = its extension such as V.O. / O.S. / CONT'D. */
export type BlockType = "action" | "cue" | "paren" | "dialogue" | "transition";
export type Block = { t: BlockType; text: string; ext?: string };
export const BLOCK_TYPES: readonly BlockType[] = ["action", "cue", "paren", "dialogue", "transition"];
export const MAX_TEXT_BYTES = 2.5 * 1024 * 1024;
export const MAX_BLOCK_CHARS = 20000;
const enc = new TextEncoder();
/** UTF-8 size of the text of some blocks. */
export const textBytes = (blocks: Block[]) => blocks.reduce((n, b) => n + enc.encode(b.text).length + (b.ext ? enc.encode(b.ext).length : 0), 0);
/** 310_000 -> "310 KB". */
export const fmtBytes = (n: number) => (n >= 1024 * 1024 ? `${(n / 1024 / 1024).toFixed(1)} MB` : `${Math.max(1, Math.round(n / 1024))} KB`);

export type ParsedCharacter = { name: string; blocks: number };
export type ParsedScene = {
  position: number;
  number: string;
  heading: string;
  intExt: string;
  location: string;
  /** Part of `location` before the first " - ", used to group locations. */
  place: string;
  timeOfDay: string;
  pageStart: number;
  pageEnd: number;
  lines: number;
  estSeconds: number;
  characters: ParsedCharacter[];
  postTags: PostTag[];
  blocks: Block[];
};

export const TIMES_OF_DAY = ["PAGI", "SIANG", "SORE", "MALAM", "SUBUH", "LAINNYA"] as const;
export const INT_EXTS = ["INT", "EXT", "INT/EXT"] as const;

/** "RUMAH BUDI - RUANG TAMU" -> "RUMAH BUDI". */
export const placeOf = (location: string) => location.split(/\s+[-–—]\s+/)[0].trim();

/** 125 -> "2:05". */
export const fmtDuration = (sec: number) => `${Math.floor(sec / 60)}:${String(Math.round(sec % 60)).padStart(2, "0")}`;

/** 12.375 -> "12 3/8". */
export function fmtPage(p: number) {
  const whole = Math.floor(p), eighths = Math.round((p - whole) * 8);
  return eighths ? `${whole} ${eighths}/8` : String(whole);
}

// ---------- post-production tags ----------

export const TAG_KINDS = ["vfx", "adr", "musik", "sound", "grading", "grafis", "lainnya"] as const;
export type TagKind = (typeof TAG_KINDS)[number];
export const TAG_LABEL: Record<TagKind, string> = { vfx: "VFX", adr: "ADR", musik: "Musik", sound: "Sound", grading: "Grading", grafis: "Grafis", lainnya: "Lainnya" };
/** `auto` = suggested by the parser, not yet confirmed. `keyword` is the short matched word; `excerpt` the sentence (or selection) it came from, shown as context. `itemId` = a schedule phase of this project. */
export type PostTag = { kind: TagKind; note: string; auto: boolean; keyword?: string; excerpt?: string; itemId?: string | null };
