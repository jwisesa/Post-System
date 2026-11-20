import { TAG_KINDS, type PostTag, type TagKind } from "./types";

// Whole words, case-insensitive. Deliberately conservative: these are suggestions the supervisor confirms.
const WORDS: Record<Exclude<TagKind, "lainnya" | "adr">, string[]> = {
  vfx: ["VFX", "CGI", "GREEN SCREEN", "LEDAKAN", "MELEDAK", "EXPLOSION", "KEMBANG API"],
  musik: ["MONTAGE", "MONTASE", "LAGU", "MUSIK", "MUSIC", "SONG", "SINGS", "MENYANYI", "NYANYI", "BERNYANYI"],
  sound: ["HUJAN", "PETIR", "DERU", "TEMBAKAN", "SIRINE", "FOLEY"],
  grading: ["FLASHBACK", "KILAS BALIK", "DAY FOR NIGHT", "MIMPI"],
  grafis: ["SUPER:", "TITLE:", "TEKS:", "LAYAR HP", "SMS", "CHAT", "PHONE SCREEN", "INSERT"],
};
const ADR_CUES = ["SUARA", "NARATOR", "NARRATOR"];

const re = (words: string[]) => new RegExp(`(?<![\\p{L}\\p{N}])(?:${words.map((w) => w.replace(/[.*+?^${}()|[\]\\]/g, "\\$&").replace(/ /g, "\\s+")).join("|")})(?![\\p{L}\\p{N}])`, "iu");
const MATCHERS = Object.entries(WORDS).map(([kind, w]) => [kind as TagKind, re(w)] as const);
const EXTENSION = /\((?:V\.?\s?O\.?|O\.?\s?S\.?|OFF)\)/i;
const CUE_NAME = re(ADR_CUES);

const MAX_EXCERPT = 240;

/** The sentence (or the line, when it has no sentence break) around a match, at most 240 chars, keyword kept. */
export function excerptOf(text: string, at: number, len: number): string {
  const bounds = [0, ...[...text.matchAll(/[.!?…]+["')\]]*\s+/g)].map((b) => b.index + b[0].length), text.length];
  const i = bounds.findIndex((b, k) => b <= at && at < bounds[k + 1]);
  const from = bounds[Math.max(0, i)], sentence = text.slice(from, bounds[i + 1] ?? text.length).trim();
  if (sentence.length <= MAX_EXCERPT) return sentence;
  const start = Math.max(from, at - 100), end = Math.min(text.length, at + len + 100);
  return `${start > from ? "…" : ""}${text.slice(start, end).trim()}${end < text.length ? "…" : ""}`.slice(0, MAX_EXCERPT);
}

/**
 * Suggests post tags for one scene while its text is still in memory. `lines` = every paragraph of the scene (heading, action, dialogue),
 * `cues` = the raw character-cue lines, `dialogues[i]` = the first dialogue after `cues[i]`. One tag per kind, with the keyword and the sentence it came from.
 */
export function suggestTags(lines: string[], cues: string[] = [], dialogues: string[] = []): PostTag[] {
  const found = new Map<TagKind, { keyword: string; excerpt: string }>();
  cues.forEach((c, i) => {
    if (found.has("adr")) return;
    const ext = EXTENSION.exec(c)?.[0];
    const name = CUE_NAME.exec(c.replace(/\([^)]*\)/g, " "))?.[0];
    if (!ext && !name) return;
    const who = c.replace(/\([^)]*\)/g, " ").replace(/[\^*]/g, "").replace(/[:.\s]+$/, "").replace(/\s+/g, " ").trim().toUpperCase() || c.trim(), shown = ext ? `${who} ${ext.toUpperCase().replace(/\s+/g, "")}` : who;
    const said = (dialogues[i] ?? "").slice(0, 120).trim();
    found.set("adr", { keyword: (ext ?? name!).toUpperCase().replace(/\s+/g, " "), excerpt: (said ? `${shown}: ${said}` : shown).slice(0, MAX_EXCERPT) });
  });
  for (const text of lines) {
    for (const [kind, rx] of MATCHERS) {
      if (found.has(kind)) continue;
      const m = rx.exec(text);
      if (m) found.set(kind, { keyword: m[0].toUpperCase().replace(/\s+/g, " "), excerpt: excerptOf(text, m.index, m[0].length) });
    }
  }
  return TAG_KINDS.filter((k) => found.has(k)).map((kind) => ({ kind, note: "", auto: true, keyword: found.get(kind)!.keyword.slice(0, 30), excerpt: found.get(kind)!.excerpt, itemId: null }));
}

const PHASE_NAME: Partial<Record<string, RegExp>> = { vfx: /vfx/i, adr: /sound/i, sound: /sound/i, musik: /music|musik/i, grading: /grading/i, grafis: /vfx|graphic|grafis|online/i };

/** The phase a tag links to by default (none for custom kinds): the only top-level phase whose name fits the kind; none when zero or several fit. */
export function defaultPhase(kind: string, phases: { id: string; name: string }[]): string | null {
  const rx = PHASE_NAME[kind];
  const hit = rx ? phases.filter((p) => rx.test(p.name)) : [];
  return hit.length === 1 ? hit[0].id : null;
}

/** "VFX 3, ADR 5" for the import preview. */
export function tagCounts(scenes: { postTags: PostTag[] }[]) {
  return TAG_KINDS.map((k) => [k, scenes.filter((s) => s.postTags.some((t) => t.kind === k)).length] as const).filter(([, n]) => n > 0);
}
