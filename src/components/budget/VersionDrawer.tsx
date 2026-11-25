"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { saveChangeOrder, saveCorrection, saveVersion } from "@/app/admin/budget-actions";
import { Drawer } from "@/components/ui/controls";
import { Icon } from "@/components/ui/icons";
import { useToast } from "@/components/ui/toast";
import { PPN_LABEL, TAX_NOTE } from "@/lib/budget/catalog";
import { formatQty, formatRateBp, formatRupiah, lineAmount, MoneyError, parseQty, parseRateBp, parseRupiah, plainRupiah, taxOf } from "@/lib/budget/money";

export type PrefillLine = { key: string; item: string; qtyMilli: number; unit: string; unitPrice: number };
type Row = { key: string; item: string; qty: string; unit: string; price: string; orig?: string };
export type SeedItem = { id: string; name: string };
const msg = (x: unknown) => (x instanceof MoneyError ? x.message : "Data tidak valid.");
const blank = (): Row => ({ key: crypto.randomUUID(), item: "", qty: "1", unit: "", price: "" });

/** Line editor for a new immutable version. The live totals are a preview; the server recomputes everything. */
export function VersionDrawer({ slug, docId, vendor, prefill, ppnBp, pph23Bp, first, onClose, co, negative, fromNumber, seeds = [], prefillPricing = "items", prefillSubtotal, correct }: { seeds?: SeedItem[]; prefillPricing?: "items" | "lump"; prefillSubtotal?: number; correct?: { versionId: string }; fromNumber?: number; slug: string; docId: string; vendor: string; co?: { bidId: string }; negative?: boolean; prefill: PrefillLine[]; ppnBp: number | null; pph23Bp: number | null; first: boolean; onClose: () => void }) {
  const toast = useToast();
  const router = useRouter();
  const seedRow = (d: SeedItem): Row => ({ key: `d:${d.id}`, item: d.name, qty: "1", unit: "", price: "", orig: d.name });
  const seedOf = (k: string) => seeds.find((d) => `d:${d.id}` === k);
  const [rows, setRows] = useState<Row[]>(prefill.length ? prefill.map((l) => ({ key: l.key, item: l.item, qty: formatQty(l.qtyMilli), unit: l.unit, price: plainRupiah(l.unitPrice), orig: seedOf(l.key)?.name })) : first ? (seeds.length ? seeds.map(seedRow) : [blank()]) : []);
  const [mode, setMode] = useState<"items" | "lump">(prefillPricing);
  const isLump = mode === "lump";
  const [reason, setReason] = useState("");
  const [lump, setLump] = useState(prefillPricing === "lump" && prefillSubtotal != null ? plainRupiah(prefillSubtotal) : "");
  const [ppn, setPpn] = useState(formatRateBp(ppnBp));
  const [pph, setPph] = useState(formatRateBp(pph23Bp));
  const [title, setTitle] = useState("");
  const [ref, setRef] = useState("");
  const [date, setDate] = useState("");
  const [notes, setNotes] = useState("");
  const [links, setLinks] = useState("");
  const [busy, setBusy] = useState(false);
  const [bad, setBad] = useState<{ i: number; k: keyof Row } | null>(null);
  const [focus, setFocusKey] = useState<{ k: string } | null>(null);
  const setFocus = (k: string) => setFocusKey({ k });
  const snap = (r: Row[]) => JSON.stringify(r.map(({ item, qty, unit, price }) => [item, qty, unit, price]));
  const [init] = useState(() => ({ rows: snap(rows), ppn, pph, lump, mode }));
  const dirty = snap(rows) !== init.rows || !!(title || ref || date || notes || links || reason) || lump !== init.lump || mode !== init.mode || ppn !== init.ppn || pph !== init.pph;
  useEffect(() => { if (focus) document.querySelector<HTMLElement>(`[data-k="${focus.k}"]`)?.focus(); }, [focus]);
  const addRow = () => { const b = blank(); setRows((r) => [...r, b]); setFocus(b.key); };
  const rowKey = (e: React.KeyboardEvent, i: number) => {
    if (e.key !== "Enter" || e.nativeEvent.isComposing) return;
    if (e.metaKey || e.ctrlKey) { e.preventDefault(); e.currentTarget.closest("form")?.requestSubmit(); return; }
    e.preventDefault();
    if (i === rows.length - 1) addRow(); else setFocus(rows[i + 1].key);
  };
  /** Pasting spreadsheet rows (item, qty, unit, price; tab separated) fills one row per line. */
  const paste = (e: React.ClipboardEvent, i: number) => {
    const t = e.clipboardData.getData("text");
    if (!/[\t\n]/.test(t.trim())) return;
    e.preventDefault();
    const add = t.split(/\r?\n/).filter((l) => l.trim()).map((l) => { const [item = "", qty = "", unit = "", price = ""] = l.split("\t").map((c) => c.trim()); return { key: crypto.randomUUID(), item, qty: qty || "1", unit, price }; });
    setRows((r) => [...r.slice(0, i), ...(!r[i].item && !r[i].price ? [] : [r[i]]), ...add, ...r.slice(i + 1)]);
  };
  const set = (i: number, k: keyof Row, v: string) => setRows((r) => r.map((x, j) => (j === i ? { ...x, [k]: v } : x)));

  const parsed = rows.map((r) => { try { return { qtyMilli: parseQty(r.qty), unitPrice: isLump ? 0 : parseRupiah(r.price, { allowNegative: true }) }; } catch { return null; } });
  const amount = (i: number) => { const p = parsed[i]; return p ? lineAmount(p.qtyMilli, p.unitPrice) : null; };
  let subtotal = 0;
  if (!isLump) subtotal = rows.reduce((n, _, i) => n + (amount(i) ?? 0), 0);
  else try { subtotal = lump.trim() ? parseRupiah(lump, { allowNegative: negative }) : 0; } catch { /* shown on save */ }
  let rates: [number | null, number | null] = [null, null];
  try { rates = [parseRateBp(ppn), parseRateBp(pph)]; } catch { /* shown on save */ }
  const tax = taxOf(subtotal, rates[0], rates[1]);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      setBad(null);
      const lines = [];
      for (const [i, r] of rows.entries()) {
        if (!r.item.trim() && (isLump || !r.price.trim())) continue;
        let k: keyof Row = "item";
        try {
          if (!r.item.trim()) throw new MoneyError("Item wajib diisi.");
          k = "qty"; const qtyMilli = parseQty(r.qty);
          k = "price"; const unitPrice = isLump ? 0 : parseRupiah(r.price, { allowNegative: true });
          lines.push({ key: r.key, item: r.item, qtyMilli, unit: r.unit, unitPrice });
        } catch (x) {
          setBad({ i, k });
          toast({ message: `Baris ${i + 1}: ${msg(x)}`, tone: "error" });
          document.querySelector<HTMLElement>(`[data-k="${k === "item" ? r.key : `${r.key}-${k}`}"]`)?.focus();
          return;
        }
      }
      setBusy(true);
      const input = {
        ref, docDate: date, lines, pricing: mode, lumpSum: isLump ? parseRupiah(lump, { allowNegative: negative }) : undefined, ppnBp: parseRateBp(ppn), pph23Bp: parseRateBp(pph), notes,
        links: links.split("\n").map((l) => l.trim()).filter(Boolean),
      };
      if (correct && !reason.trim()) { setBusy(false); toast({ message: "Isi alasan koreksi.", tone: "error" }); return; }
      const res = correct ? await saveCorrection(slug, correct.versionId, input, reason) : co ? await saveChangeOrder(slug, co.bidId, title, input) : await saveVersion(slug, docId, input);
      setBusy(false);
      if (!res.ok) { toast({ message: res.error, tone: "error" }); return; }
      toast({ message: correct ? `Dikoreksi jadi versi ${res.number}.` : `Versi ${res.number} disimpan.` });
      onClose();
      router.refresh();
    } catch (x) {
      setBusy(false);
      toast({ message: x instanceof MoneyError ? x.message : "Data tidak valid.", tone: "error" });
    }
  };

  return (
    <Drawer title={correct ? "Koreksi versi" : co ? "Tambahan baru" : "Versi baru"} crumb={fromNumber ? `${vendor} · dari v${fromNumber}` : vendor} dirty={dirty} onClose={onClose}>
      <form onSubmit={submit} className="space-y-4 text-sm">
        {co && <label className="grid gap-1">Judul tambahan pekerjaan<input value={title} maxLength={120} required placeholder="Tambah 2 hari" onChange={(e) => setTitle(e.target.value)} /></label>}
        <div className="grid grid-cols-2 gap-2">
          <label className="grid gap-1">No. dokumen vendor<input value={ref} maxLength={80} onChange={(e) => setRef(e.target.value)} /></label>
          <label className="grid gap-1">Tanggal<input type="date" value={date} onChange={(e) => setDate(e.target.value)} /></label>
        </div>
        {correct && <label className="grid gap-1">Alasan koreksi (wajib)<textarea rows={2} required maxLength={500} value={reason} placeholder="mis. salah ketik harga" onChange={(e) => setReason(e.target.value)} /></label>}
        <div role="tablist" aria-label="Cara harga" className="seg">
          {(["items", "lump"] as const).map((m) => <button key={m} type="button" role="tab" aria-selected={mode === m} onClick={() => setMode(m)}>{m === "items" ? "Per item" : "Lump sum"}</button>)}
        </div>
        {isLump && <label className="grid gap-1">Total paket (Rp), sebelum pajak<input inputMode="numeric" value={lump} onChange={(e) => setLump(e.target.value)} /></label>}
        {isLump && <h3 className="text-sm font-semibold">Rincian isi paket</h3>}
        {rows.length > 0 ? (
          <div className="space-y-1.5">
            {rows.map((r, i) => (
              <div key={r.key} className="bg-lines pb-2" onKeyDown={(e) => rowKey(e, i)} style={{ borderBottom: "1px solid var(--line)", ...(isLump ? { gridTemplateColumns: "4rem 4.5rem minmax(7.5rem, 1fr) auto" } : {}) }}>
                <textarea rows={1} data-k={r.key} aria-invalid={bad?.i === i && bad.k === "item" || undefined} aria-label="Item" placeholder="Item (tempel dari spreadsheet: item, qty, satuan, harga)" className="bg-item" value={r.item} maxLength={200} onChange={(e) => set(i, "item", e.target.value)} onPaste={(e) => paste(e, i)} />
                <input data-k={`${r.key}-qty`} aria-invalid={bad?.i === i && bad.k === "qty" || undefined} aria-label="Qty" placeholder="mis. 2,5" inputMode="decimal" value={r.qty} onChange={(e) => set(i, "qty", e.target.value)} />
                <input aria-label="Satuan" placeholder="Satuan" value={r.unit} maxLength={20} onChange={(e) => set(i, "unit", e.target.value)} />
                {!isLump && <input data-k={`${r.key}-price`} aria-invalid={bad?.i === i && bad.k === "price" || undefined} aria-label="Harga satuan" inputMode="numeric" placeholder="Harga satuan" value={r.price} onChange={(e) => set(i, "price", e.target.value)} />}
                {!isLump && <span className="bg-amount">{amount(i) == null ? "—" : formatRupiah(amount(i)!)}</span>}
                {r.orig && r.item.trim() !== r.orig && <span className="muted text-xs" style={{ gridColumn: "1 / -1" }}>Deliverable: {r.orig}</span>}
                <button type="button" className="btn-ghost btn-icon" aria-label="Hapus baris" onClick={() => setRows((x) => x.filter((_, j) => j !== i))}><Icon name="close" /></button>
              </div>
            ))}
          </div>
        ) : <p className="muted text-sm">{isLump ? "Belum ada rincian. Boleh dikosongkan." : "Belum ada baris."}</p>}
        <div className="flex gap-2">
          <button type="button" className="btn-secondary" onClick={addRow}>Tambah baris</button>
          {seeds.some((d) => !rows.some((r) => r.key === `d:${d.id}`)) && <button type="button" className="btn-ghost" onClick={() => setRows((r) => [...r.filter((x) => x.item.trim() || x.price.trim()), ...seeds.filter((d) => !r.some((x) => x.key === `d:${d.id}`)).map(seedRow)])}>Isi dari deliverable</button>}
        </div>
        <p className="muted text-xs">{isLump ? "Rincian isi paket tanpa harga; total paket di atas yang dihitung." : "Harga satuan boleh negatif untuk baris diskon."}{negative && " Total tambahan boleh negatif (pengurangan)."}</p>
        <div className="grid grid-cols-2 gap-2">
          <label className="grid gap-1">{PPN_LABEL} (%, kosong = tanpa)<input inputMode="decimal" value={ppn} onChange={(e) => setPpn(e.target.value)} /></label>
          <label className="grid gap-1">PPh 23 (%, kosong = tanpa)<input inputMode="decimal" value={pph} onChange={(e) => setPph(e.target.value)} /></label>
        </div>
        <dl className="grid grid-cols-[1fr_auto] gap-x-4 gap-y-1 tabular-nums">
          <dt>Subtotal</dt><dd className="bg-amount">{formatRupiah(tax.subtotal)}</dd>
          <dt>Perkiraan PPN</dt><dd className="bg-amount">{formatRupiah(tax.ppn)}</dd>
          <dt>Perkiraan PPh 23</dt><dd className="bg-amount">{formatRupiah(-tax.pph23)}</dd>
        </dl>
        <p className="muted text-xs">{TAX_NOTE}</p>
        <label className="grid gap-1">Catatan perubahan{first || correct ? " (opsional)" : " (wajib)"}<textarea rows={2} value={notes} maxLength={1000} required={!first && !correct} onChange={(e) => setNotes(e.target.value)} /></label>
        <label className="grid gap-1">Link (satu per baris, maks. 5, http/https)<textarea rows={2} value={links} onChange={(e) => setLinks(e.target.value)} /></label>
        <div className="drawer-foot">
          <button className="btn" disabled={busy}>{busy ? "Menyimpan…" : correct ? "Simpan koreksi" : "Simpan versi"}</button>
          <span className="muted ms-auto self-center tabular-nums">Perkiraan net dibayar <b className="text-ink">{formatRupiah(tax.net)}</b></span>
        </div>
      </form>
    </Drawer>
  );
}
