/** Pure helpers: pasted feedback text to points, and the cross-check list for a milestone. */

export type ParsedPoint = { ref: string; body: string };

const BULLET = /^\s*(?:[-*•–]\s+|\d+[.)]\s+)/;
const BRACKET = /^\[([^\]]{1,40})\]\s*/;
const TIMECODE = /^(\d{1,2}:\d{2}(?::\d{2}){0,2}(?:[:;]\d{2})?)\s+/;

/** One point per non-empty line; bullets/numbering stripped; a leading [pointer] or timecode goes to ref. */
export function parsePoints(text: string): ParsedPoint[] {
  const out: ParsedPoint[] = [];
  for (const raw of text.split(/\r?\n/)) {
    let line = raw.replace(BULLET, "").trim();
    if (!line) continue;
    let ref = "";
    const m = line.match(BRACKET) ?? line.match(TIMECODE);
    if (m && line.length > m[0].length) {
      ref = m[1].trim();
      line = line.slice(m[0].length).trim();
    }
    out.push({ ref, body: line.slice(0, 1000) });
  }
  return out;
}

type Item = { id: string; parentId: string | null; startDate: string; createdAt: Date | string };
type Point = { id: string; itemId: string; status: string; checkedItemId: string | null; sortOrder: number; createdAt: Date | string };

const time = (d: Date | string) => new Date(d).getTime();

/**
 * Points to cross-check at `itemId`: still-open points from EARLIER milestones of the same phase
 * (earlier date; ties by creation order), plus points already checked AT this item so the list stays complete.
 */
export function carryOver<P extends Point>(items: Item[], points: P[], itemId: string): P[] {
  const me = items.find((i) => i.id === itemId);
  if (!me || !me.parentId) return [];
  const rank = new Map<string, number>();
  const earlier = items
    .filter((i) => i.parentId === me.parentId && i.id !== me.id && (i.startDate < me.startDate || (i.startDate === me.startDate && time(i.createdAt) < time(me.createdAt))))
    .sort((a, b) => a.startDate.localeCompare(b.startDate) || time(a.createdAt) - time(b.createdAt));
  earlier.forEach((i, n) => rank.set(i.id, n));
  return points
    .filter((p) => p.checkedItemId === itemId || (rank.has(p.itemId) && p.status === "open"))
    .sort((a, b) => (rank.get(a.itemId) ?? 999) - (rank.get(b.itemId) ?? 999) || a.sortOrder - b.sortOrder || time(a.createdAt) - time(b.createdAt));
}
