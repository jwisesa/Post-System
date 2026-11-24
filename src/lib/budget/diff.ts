import type { BudgetLine } from "@/db/schema";

export type Line = BudgetLine;
export type LineDiff = { key: string; kind: "added" | "removed" | "changed" | "same"; item: string; oldItem?: string; a?: Line; b?: Line; delta: number };
export type VersionLike = { lines: Line[]; subtotal: number; ppn: number; pph23: number };

const norm = (s: string) => s.toLowerCase().trim().replace(/\s+/g, " ");
const net = (v: VersionLike) => v.subtotal + v.ppn - v.pph23;

/** a = before, b = after. Lines match by key, then one-to-one by item name, so it also compares different vendors. */
export function diffVersions(a: VersionLike, b: VersionLike) {
  const pair = new Map<number, Line>(); // index in b -> matching line in a
  const used = new Set<Line>();
  b.lines.forEach((l, i) => { const m = a.lines.find((x) => x.key === l.key && !used.has(x)); if (m) { pair.set(i, m); used.add(m); } });
  b.lines.forEach((l, i) => {
    if (pair.has(i)) return;
    const m = a.lines.find((x) => !used.has(x) && norm(x.item) === norm(l.item));
    if (m) { pair.set(i, m); used.add(m); }
  });
  const rows: LineDiff[] = b.lines.map((l, i) => {
    const m = pair.get(i);
    if (!m) return { key: l.key, kind: "added", item: l.item, b: l, delta: l.amount };
    const changed = m.item !== l.item || m.qtyMilli !== l.qtyMilli || m.unit !== l.unit || m.unitPrice !== l.unitPrice || m.amount !== l.amount;
    return { key: l.key, kind: changed ? "changed" : "same", item: l.item, oldItem: m.item !== l.item ? m.item : undefined, a: m, b: l, delta: l.amount - m.amount };
  });
  for (const l of a.lines) if (!used.has(l)) rows.push({ key: l.key, kind: "removed", item: l.item, a: l, delta: -l.amount });
  return { rows, dSubtotal: b.subtotal - a.subtotal, dPpn: b.ppn - a.ppn, dPph23: b.pph23 - a.pph23, dNet: net(b) - net(a) };
}
