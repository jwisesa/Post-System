// Quote line kinds. A line with no `kind` is an old "item". Only item/package amounts are ever counted.
import type { BudgetLine } from "@/db/schema";

export const LINE_KINDS = ["item", "package", "included", "note"] as const;
export type LineKind = (typeof LINE_KINDS)[number];
export const KIND_LABEL: Record<LineKind, string> = { item: "Item", package: "Paket", included: "Termasuk paket", note: "Catatan" };
export const PRICE_STATE = { varies: "Harga bervariasi", unavailable: "Tidak tersedia" } as const;

export const kindOf = (l: Pick<BudgetLine, "kind">): LineKind => l.kind ?? "item";
export const isCounted = (k: LineKind | undefined) => k === undefined || k === "item" || k === "package";

export type Section = { group: string; lines: BudgetLine[]; subtotal: number };
/** Sections in order of first appearance (lines of one group name merge); "" = no section. Subtotal = sum of amounts. */
export function sections(lines: BudgetLine[]): Section[] {
  const out: Section[] = [];
  for (const l of lines) {
    const g = l.group ?? "";
    let s = out.find((x) => x.group === g);
    if (!s) out.push((s = { group: g, lines: [], subtotal: 0 }));
    s.lines.push(l);
    s.subtotal += l.amount;
  }
  return out;
}
