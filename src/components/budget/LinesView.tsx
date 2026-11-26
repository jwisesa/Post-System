import type { BudgetLine } from "@/db/schema";
import { kindOf, PRICE_STATE, sections } from "@/lib/budget/lines";
import { fmt, formatQty } from "@/lib/budget/money";

/** Read-only quote lines grouped by section: subtotal per section, included lines indented without amount, notes tagged, qty 0 muted. */
export function LinesView({ lines, className = "table w-full text-sm" }: { lines: BudgetLine[]; className?: string }) {
  if (!lines.length) return <p className="muted text-sm">Tidak ada rincian (lump sum).</p>;
  const secs = sections(lines);
  return (
    <table className={className}>
      <thead><tr><th className="text-start">Item</th><th className="bg-num">Qty</th><th className="text-start">Satuan</th><th className="bg-num">Harga (Rp)</th><th className="bg-num">Jumlah (Rp)</th></tr></thead>
      {secs.map((s) => (
        <tbody key={s.group || "-"}>
          {s.group && <tr style={{ background: "var(--surface-2, transparent)" }}><th colSpan={4} className="text-start">{s.group}</th><th className="bg-num">{fmt(s.subtotal)}</th></tr>}
          {s.lines.map((l) => {
            const k = kindOf(l);
            const off = k === "included" || k === "note" || ((k === "item" || k === "package") && l.qtyMilli === 0);
            return (
              <tr key={l.key} style={off ? { opacity: 0.7 } : undefined}>
                <td style={k === "included" ? { paddingInlineStart: "1.5rem" } : undefined}>
                  <span className={k === "package" ? "font-medium" : undefined}>{l.item}</span>
                  {k === "package" && <span className="tag ms-1">paket</span>}
                  {k === "note" && <span className="tag ms-1">{l.priceState ? PRICE_STATE[l.priceState] : "catatan"}</span>}
                  {l.note && <span className="muted block text-xs">{l.note}</span>}
                </td>
                {k === "included" || k === "note" ? <td colSpan={4} className="muted text-end text-xs">{k === "included" ? "termasuk paket" : ""}</td> : (
                  <>
                    <td className="bg-num">{formatQty(l.qtyMilli)}</td><td>{l.unit}</td><td className="bg-num">{fmt(l.unitPrice)}</td>
                    <td className="bg-num">{l.qtyMilli === 0 ? <span className="muted text-xs">tidak diambil</span> : fmt(l.amount)}</td>
                  </>
                )}
              </tr>
            );
          })}
        </tbody>
      ))}
    </table>
  );
}
