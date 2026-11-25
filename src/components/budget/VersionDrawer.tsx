"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { saveChangeOrder, saveVersion } from "@/app/admin/budget-actions";
import { Drawer } from "@/components/ui/controls";
import { Icon } from "@/components/ui/icons";
import { useToast } from "@/components/ui/toast";
import { PPN_LABEL, TAX_NOTE } from "@/lib/budget/catalog";
import { formatQty, formatRateBp, formatRupiah, lineAmount, MoneyError, parseQty, parseRateBp, parseRupiah, taxOf } from "@/lib/budget/money";

export type PrefillLine = { key: string; item: string; qtyMilli: number; unit: string; unitPrice: number };
type Row = { key: string; item: string; qty: string; unit: string; price: string };
const blank = (): Row => ({ key: crypto.randomUUID(), item: "", qty: "1", unit: "", price: "" });

/** Line editor for a new immutable version. The live totals are a preview; the server recomputes everything. */
export function VersionDrawer({ slug, docId, vendor, prefill, ppnBp, pph23Bp, first, onClose, co, negative }: { slug: string; docId: string; vendor: string; co?: { bidId: string }; negative?: boolean; prefill: PrefillLine[]; ppnBp: number | null; pph23Bp: number | null; first: boolean; onClose: () => void }) {
  const toast = useToast();
  const router = useRouter();
  const [rows, setRows] = useState<Row[]>(prefill.length ? prefill.map((l) => ({ key: l.key, item: l.item, qty: formatQty(l.qtyMilli), unit: l.unit, price: String(l.unitPrice) })) : first ? [blank()] : []);
  const [lump, setLump] = useState("");
  const [ppn, setPpn] = useState(formatRateBp(ppnBp));
  const [pph, setPph] = useState(formatRateBp(pph23Bp));
  const [title, setTitle] = useState("");
  const [ref, setRef] = useState("");
  const [date, setDate] = useState("");
  const [notes, setNotes] = useState("");
  const [links, setLinks] = useState("");
  const [busy, setBusy] = useState(false);
  const set = (i: number, k: keyof Row, v: string) => setRows((r) => r.map((x, j) => (j === i ? { ...x, [k]: v } : x)));

  const parsed = rows.map((r) => { try { return { qtyMilli: parseQty(r.qty), unitPrice: parseRupiah(r.price, { allowNegative: true }) }; } catch { return null; } });
  const amount = (i: number) => { const p = parsed[i]; return p ? lineAmount(p.qtyMilli, p.unitPrice) : null; };
  let subtotal = 0;
  if (rows.length) subtotal = rows.reduce((n, _, i) => n + (amount(i) ?? 0), 0);
  else try { subtotal = lump.trim() ? parseRupiah(lump, { allowNegative: negative }) : 0; } catch { /* shown on save */ }
  let rates: [number | null, number | null] = [null, null];
  try { rates = [parseRateBp(ppn), parseRateBp(pph)]; } catch { /* shown on save */ }
  const tax = taxOf(subtotal, rates[0], rates[1]);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      const lines = rows.map((r) => ({ key: r.key, item: r.item, qtyMilli: parseQty(r.qty), unit: r.unit, unitPrice: parseRupiah(r.price, { allowNegative: true }) }));
      setBusy(true);
      const input = {
        ref, docDate: date, lines, lumpSum: rows.length ? undefined : parseRupiah(lump, { allowNegative: negative }), ppnBp: parseRateBp(ppn), pph23Bp: parseRateBp(pph), notes,
        links: links.split("\n").map((l) => l.trim()).filter(Boolean),
      };
      const res = co ? await saveChangeOrder(slug, co.bidId, title, input) : await saveVersion(slug, docId, input);
      setBusy(false);
      if (!res.ok) { toast({ message: res.error, tone: "error" }); return; }
      toast({ message: `Versi ${res.number} disimpan.` });
      onClose();
      router.refresh();
    } catch (x) {
      setBusy(false);
      toast({ message: x instanceof MoneyError ? x.message : "Data tidak valid.", tone: "error" });
    }
  };

  return (
    <Drawer title={co ? "Tambahan baru" : "Versi baru"} crumb={vendor} onClose={onClose}>
      <form onSubmit={submit} className="space-y-4 text-sm">
        {co && <label className="grid gap-1">Judul tambahan pekerjaan<input value={title} maxLength={120} required placeholder="Tambah 2 hari" onChange={(e) => setTitle(e.target.value)} /></label>}
        <div className="grid grid-cols-2 gap-2">
          <label className="grid gap-1">No. dokumen vendor<input value={ref} maxLength={80} onChange={(e) => setRef(e.target.value)} /></label>
          <label className="grid gap-1">Tanggal<input type="date" value={date} onChange={(e) => setDate(e.target.value)} /></label>
        </div>
        {rows.length > 0 ? (
          <div className="space-y-1.5">
            {rows.map((r, i) => (
              <div key={r.key} className="bg-lines pb-2" style={{ borderBottom: "1px solid var(--line)" }}>
                <input aria-label="Item" placeholder="Item" className="bg-item" value={r.item} maxLength={200} onChange={(e) => set(i, "item", e.target.value)} />
                <input aria-label="Qty" placeholder="mis. 2,5" inputMode="decimal" value={r.qty} onChange={(e) => set(i, "qty", e.target.value)} />
                <input aria-label="Satuan" placeholder="Satuan" value={r.unit} maxLength={20} onChange={(e) => set(i, "unit", e.target.value)} />
                <input aria-label="Harga satuan" inputMode="numeric" placeholder="Harga satuan" value={r.price} onChange={(e) => set(i, "price", e.target.value)} />
                <span className="bg-amount">{amount(i) == null ? "—" : formatRupiah(amount(i)!)}</span>
                <button type="button" className="btn-ghost btn-icon" aria-label="Hapus baris" onClick={() => setRows((x) => x.filter((_, j) => j !== i))}><Icon name="close" /></button>
              </div>
            ))}
          </div>
        ) : (
          <label className="grid gap-1">Jumlah lump sum, sebelum pajak (Rp)<input inputMode="numeric" value={lump} onChange={(e) => setLump(e.target.value)} /></label>
        )}
        <div className="flex gap-2">
          <button type="button" className="btn-secondary" onClick={() => setRows((r) => [...r, blank()])}>Tambah baris</button>
          {rows.length > 0 && <button type="button" className="btn-ghost" onClick={() => setRows([])}>Pakai lump sum</button>}
        </div>
        <p className="muted text-xs">Harga satuan boleh negatif untuk baris diskon.{negative && " Total tambahan boleh negatif (pengurangan)."}</p>
        <div className="grid grid-cols-2 gap-2">
          <label className="grid gap-1">{PPN_LABEL} (%, kosong = tanpa)<input inputMode="decimal" value={ppn} onChange={(e) => setPpn(e.target.value)} /></label>
          <label className="grid gap-1">PPh 23 (%, kosong = tanpa)<input inputMode="decimal" value={pph} onChange={(e) => setPph(e.target.value)} /></label>
        </div>
        <dl className="grid grid-cols-[1fr_auto] gap-x-4 gap-y-1 tabular-nums">
          <dt>Subtotal</dt><dd className="bg-amount">{formatRupiah(tax.subtotal)}</dd>
          <dt>Perkiraan PPN</dt><dd className="bg-amount">{formatRupiah(tax.ppn)}</dd>
          <dt>Perkiraan PPh 23</dt><dd className="bg-amount">{formatRupiah(-tax.pph23)}</dd>
          <dt className="font-medium">Perkiraan net dibayar</dt><dd className="bg-amount font-medium">{formatRupiah(tax.net)}</dd>
        </dl>
        <p className="muted text-xs">{TAX_NOTE}</p>
        <label className="grid gap-1">Catatan perubahan{first ? " (opsional)" : " (wajib)"}<textarea rows={2} value={notes} maxLength={1000} required={!first} onChange={(e) => setNotes(e.target.value)} /></label>
        <label className="grid gap-1">Link (satu per baris, maks. 5, http/https)<textarea rows={2} value={links} onChange={(e) => setLinks(e.target.value)} /></label>
        <button className="btn" disabled={busy}>{busy ? "Menyimpan…" : "Simpan versi"}</button>
      </form>
    </Drawer>
  );
}
