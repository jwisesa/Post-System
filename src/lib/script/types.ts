// Plain types and tiny helpers shared by the parser, the service and the UI. No imports, safe in client components.

export type PdfLine = { y: number; x: number; text: string; /** page number, "CONTINUED", "(MORE)": not content. */ skip?: boolean };
export type PdfPage = { page: number; height: number; lines: PdfLine[] };

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
/** `auto` = suggested by the parser, not yet confirmed. `keyword` is the short matched word, never a sentence. `itemId` = a schedule phase of this project. */
export type PostTag = { kind: TagKind; note: string; auto: boolean; keyword?: string; itemId?: string | null };
