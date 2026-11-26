"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { saveChangeOrder, saveCorrection, saveVersion } from "@/app/admin/budget-actions";
import { Drawer } from "@/components/ui/controls";
import { Icon } from "@/components/ui/icons";
import { useToast } from "@/components/ui/toast";
import type { BudgetLine } from "@/db/schema";
import { PPN_LABEL, TAX_NOTE } from "@/lib/budget/catalog";
import { isCounted, KIND_LABEL, kindOf, LINE_KINDS, PRICE_STATE, sections, type LineKind } from "@/lib/budget/lines";
import { formatQty, formatRateBp, formatRupiah, lineAmount, MoneyError, parseQty, parseRateBp, parseRupiah, plainRupiah, taxOf } from "@/lib/budget/money";

export type SeedItem = { id: string; name: string };
type Row = { key: string; kind: LineKind; parent?: string; item: string; qty: string; unit: string; price: string; info: string; state: "" | "varies" | "unavailable"; orig?: string };
type Sec = { id: string; name: string; rows: Row[] };
const msg = (x: unknown) => (x instanceof MoneyError ? x.message : "Data tidak valid.");
const blank = (kind: LineKind = "item"): Row => ({ key: crypto.randomUUID(), kind, item: "", qty: kind === "note" ? "0" : "1", unit: kind === "package" ? "paket" : "", price: "", info: "", state: "" });
const emptyRow = (r: Row) => !r.item.trim() && (r.kind === "included" || r.kind === "note" || !r.price.trim());
const hasPkg = (rows: Row[], k?: string) => !!k && rows.some((x) => x.key === k && x.kind === "package");
/** A package with its included lines, or one standalone row. */
function blocks(rows: Row[]): Row[][] {
  const out: Row[][] = [];
  for (const r of rows) { const h = out.at(-1)?.[0]; if (r.kind === "included" && h?.kind === "package" && r.parent === h.key) out.at(-1)!.push(r); else out.push([r]); }
  return out;
}
function moveRow(rows: Row[], i: number, d: number): Row[] {
  const r = rows[i], out = [...rows];
  if (r.kind === "included" && hasPkg(rows, r.parent)) { const t = i + d; if (rows[t]?.parent !== r.parent) return rows; [out[i], out[t]] = [out[t], out[i]]; return out; }
  const bs = blocks(rows), bi = bs.findIndex((x) => x.includes(r)), t = bi + d;
  if (!bs[t]) return rows;
  [bs[bi], bs[t]] = [bs[t], bs[bi]];
  return bs.flat();
}
const toRow = (l: BudgetLine, seedName?: string): Row => ({ key: l.key, kind: kindOf(l), parent: l.parent, item: l.item, qty: formatQty(l.qtyMilli), unit: l.unit, price: isCounted(kindOf(l)) ? plainRupiah(l.unitPrice) : "", info: l.note ?? "", state: l.priceState ?? "", orig: seedName });

/** Prefill -> sections. An old lump version becomes one package line (its lump price) with its lines as included. */
function initial(prefill: BudgetLine[], lumpPrice: number | null, first: boolean, seeds: SeedItem[]): Sec[] {
  const sid = () => crypto.randomUUID();
  if (lumpPrice != null) {
    const pkg: Row = { ...blank("package"), item: "Paket", price: plainRupiah(lumpPrice) };
    return [{ id: sid(), name: "", rows: [pkg, ...prefill.map((l) => ({ ...toRow(l), kind: "included" as const, parent: pkg.key, price: "" }))] }];
  }
  if (prefill.length) return sections(prefill).map((s) => ({ id: sid(), name: s.group, rows: s.lines.map((l) => toRow(l, seeds.find((d) => `d:${d.id}` === l.key)?.name)) }));
  return [{ id: sid(), name: "", rows: first ? (seeds.length ? seeds.map((d) => ({ ...blank(), key: `d:${d.id}`, item: d.name, orig: d.name })) : [blank()]) : [] }];
}

const PRICE_VARY = /may vary|bervariasi|varies/i, PRICE_NONE = /unavailable|tidak tersedia/i;
/** Spreadsheet row -> Row. 5 columns = Item, Status/Info, Qty, Unit, Price; up to 4 = Item, Qty, Unit, Price. "Yes"/"Basic Bundled Service" = included, "Price May Vary"/"Unavailable" = note. */
function pasteRow(cols: string[]): Row {
  const [item = "", ...rest] = cols;
  const [info, qty, unit, price] = cols.length >= 5 ? rest.slice(0, 4) : ["", rest[0] ?? "", rest[1] ?? "", rest[2] ?? ""];
  const p = price ?? "", q = qty ?? "";
  const bundled = /^yes$/i.test(info) || /bundled/i.test(p);
  const state = PRICE_VARY.test(p) ? "varies" : PRICE_NONE.test(p) ? "unavailable" : "";
  const kind: LineKind = bundled ? "included" : state ? "note" : "item";
  return { ...blank(kind), item, info: /^yes$/i.test(info) ? "" : info, state, qty: kind === "note" ? "0" : q || "1", unit: unit ?? "", price: kind === "item" && /\d/.test(p) ? p : "" };
}

/** Quote editor for a new immutable version: sections of lines (item / package / included / note). The live totals are a preview; the server recomputes everything. */
export function VersionDrawer({ slug, docId, vendor, prefill, ppnBp, pph23Bp, first, onClose, co, negative, fromNumber, seeds = [], prefillPricing = "items", prefillSubtotal, correct }: { seeds?: SeedItem[]; prefillPricing?: "items" | "lump"; prefillSubtotal?: number; correct?: { versionId: string }; fromNumber?: number; slug: string; docId: string; vendor: string; co?: { bidId: string }; negative?: boolean; prefill: BudgetLine[]; ppnBp: number | null; pph23Bp: number | null; first: boolean; onClose: () => void }) {
  const toast = useToast();
  const router = useRouter();
  const [secs, setSecs] = useState<Sec[]>(() => initial(prefill, prefillPricing === "lump" ? prefillSubtotal ?? 0 : null, first, seeds));
  const allRows = secs.flatMap((s) => s.rows);
  const [reason, setReason] = useState("");
  const [ppn, setPpn] = useState(formatRateBp(ppnBp));
  const [pph, setPph] = useState(formatRateBp(pph23Bp));
  const [title, setTitle] = useState("");
  const [ref, setRef] = useState("");
  const [date, setDate] = useState("");
  const [notes, setNotes] = useState("");
  const [links, setLinks] = useState("");
  const [busy, setBusy] = useState(false);
  const [bad, setBad] = useState<{ k: string; f: string } | null>(null);
  const [focus, setFocusKey] = useState<{ k: string } | null>(null);
  const setFocus = (k: string) => setFocusKey({ k });
  const snap = (x: Sec[]) => JSON.stringify(x.map((s) => [s.name, s.rows.map(({ kind, item, qty, unit, price, info, state }) => [kind, item, qty, unit, price, info, state])]));
  const [init] = useState(() => ({ secs: snap(secs), ppn, pph }));
  const dirty = snap(secs) !== init.secs || !!(title || ref || date || notes || links || reason) || ppn !== init.ppn || pph !== init.pph;
  useEffect(() => { if (focus) document.querySelector<HTMLElement>(`[data-k="${focus.k}"]`)?.focus(); }, [focus]);

  const mapSec = (si: number, f: (rows: Row[]) => Row[]) => setSecs((x) => x.map((s, j) => (j === si ? { ...s, rows: f(s.rows) } : s)));
  const set = (si: number, i: number, patch: Partial<Row>) => mapSec(si, (rows) => rows.map((r, j) => (j === i ? { ...r, ...patch } : r)));
  const setKind = (si: number, i: number, kind: LineKind) => mapSec(si, (rows) => {
    const prev = [...rows.slice(0, i)].reverse().find((x) => x.kind === "package");
    const me = rows[i], out = rows.map((r, j) => (j === i ? { ...r, kind, parent: kind === "included" ? prev?.key : undefined, price: kind === "item" || kind === "package" ? r.price : "", unit: kind === "package" && !r.unit ? "paket" : r.unit, qty: kind === "note" ? "0" : r.qty === "0" && kind !== "item" && kind !== "package" ? "1" : r.qty } : r));
    if (kind === "package") for (let j = i + 1; out[j]?.kind === "included" && !hasPkg(rows, out[j].parent); j++) out[j] = { ...out[j], parent: me.key }; // a new package adopts the unparented included lines right below it
    return out;
  });
  const addRow = (si: number, kind: LineKind = "item", at?: number, parent?: string) => {
    const b = { ...blank(kind), parent };
    mapSec(si, (rows) => (at == null ? [...rows, b] : [...rows.slice(0, at), b, ...rows.slice(at)]));
    setFocus(b.key);
  };
  const addChild = (si: number, pkg: Row) => {
    const rows = secs[si].rows;
    let at = rows.indexOf(pkg) + 1;
    while (rows[at]?.kind === "included" && rows[at].parent === pkg.key) at++;
    addRow(si, "included", at, pkg.key);
  };
  const addSection = () => { const id = crypto.randomUUID(), b = blank(); setSecs((x) => [...x, { id, name: "", rows: [b] }]); setFocus(`sec-${id}`); };
  const delRow = (si: number, i: number) => mapSec(si, (rows) => rows.filter((_, j) => j !== i));
  const delSec = (si: number) => {
    if (secs[si].rows.some((r) => !emptyRow(r)) && !window.confirm(`Hapus bagian "${secs[si].name || "tanpa nama"}" beserta barisnya?`)) return;
    setSecs((x) => x.filter((_, j) => j !== si));
  };
  const moveSec = (si: number, d: number) => setSecs((x) => { if (!x[si + d]) return x; const o = [...x]; [o[si], o[si + d]] = [o[si + d], o[si]]; return o; });
  const rowKey = (e: React.KeyboardEvent, si: number, i: number) => {
    if (e.key !== "Enter" || e.nativeEvent.isComposing || !(e.target instanceof HTMLTextAreaElement || e.target instanceof HTMLInputElement)) return;
    if (e.metaKey || e.ctrlKey) { e.preventDefault(); e.currentTarget.closest("form")?.requestSubmit(); return; }
    e.preventDefault();
    const rows = secs[si].rows;
    if (i === rows.length - 1) addRow(si); else setFocus(rows[i + 1].key);
  };
  /** Pasting spreadsheet rows (tab separated) fills one row per line. An included line joins the package above it. */
  const paste = (e: React.ClipboardEvent, si: number, i: number) => {
    const t = e.clipboardData.getData("text");
    if (!/[\t\n]/.test(t.trim())) return;
    e.preventDefault();
    mapSec(si, (rows) => {
      const out = [...rows.slice(0, i), ...(emptyRow(rows[i]) ? [] : [rows[i]])];
      for (const l of t.split(/\r?\n/).filter((x) => x.trim())) {
        const r = pasteRow(l.split("\t").map((c) => c.trim()));
        if (r.kind === "included") r.parent = [...out].reverse().find((x) => x.kind === "package")?.key;
        out.push(r);
      }
      return [...out, ...rows.slice(i + 1)];
    });
  };

  const amountOf = (r: Row): number | null => {
    if (!isCounted(r.kind)) return 0;
    try { return lineAmount(parseQty(r.qty, { allowZero: true }), parseRupiah(r.price, { allowNegative: true })); } catch { return r.price.trim() === "" && r.item.trim() === "" ? 0 : null; }
  };
  const secTotal = (rows: Row[]) => rows.reduce((n, r) => n + (amountOf(r) ?? 0), 0);
  const subtotal = allRows.reduce((n, r) => n + (amountOf(r) ?? 0), 0);
  let rates: [number | null, number | null] = [null, null];
  try { rates = [parseRateBp(ppn), parseRateBp(pph)]; } catch { /* shown on save */ }
  const tax = taxOf(subtotal, rates[0], rates[1]);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      setBad(null);
      const lines = [];
      for (const s of secs) {
        const group = s.name.trim();
        if (group.length > 60) { toast({ message: "Nama bagian maksimal 60 karakter.", tone: "error" }); return; }
        for (const [i, r] of s.rows.entries()) {
          if (emptyRow(r)) continue;
          let f = "item";
          try {
            if (!r.item.trim()) throw new MoneyError("Item wajib diisi.");
            const counted = isCounted(r.kind);
            f = "qty"; const qtyMilli = r.kind === "note" ? 0 : parseQty(r.qty, { allowZero: true });
            f = "price"; const unitPrice = counted ? parseRupiah(r.price, { allowNegative: true }) : 0;
            lines.push({ key: r.key, item: r.item, qtyMilli, unit: r.kind === "note" ? "" : r.unit, unitPrice, kind: r.kind, ...(group ? { group } : {}), ...(r.kind === "included" && hasPkg(s.rows, r.parent) ? { parent: r.parent } : {}), ...(r.info.trim() ? { note: r.info.trim() } : {}), ...(r.kind === "note" && r.state ? { priceState: r.state } : {}) });
          } catch (x) {
            setBad({ k: r.key, f });
            toast({ message: `Baris "${r.item.trim() || i + 1}": ${msg(x)}`, tone: "error" });
            document.querySelector<HTMLElement>(`[data-k="${f === "item" ? r.key : `${r.key}-${f}`}"]`)?.focus();
            return;
          }
        }
      }
      setBusy(true);
      const input = { ref, docDate: date, lines, pricing: "items" as const, ppnBp: parseRateBp(ppn), pph23Bp: parseRateBp(pph), notes, links: links.split("\n").map((l) => l.trim()).filter(Boolean) };
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
  const unseeded = seeds.filter((d) => !allRows.some((r) => r.key === `d:${d.id}`));
  const fillSeeds = () => setSecs((x) => x.map((s, j) => (j === 0 ? { ...s, rows: [...s.rows.filter((r) => !emptyRow(r)), ...unseeded.map((d) => ({ ...blank(), key: `d:${d.id}`, item: d.name, orig: d.name }))] } : s)));

  return (
    <Drawer title={correct ? "Koreksi versi" : co ? "Tambahan baru" : "Versi baru"} crumb={fromNumber ? `${vendor} · dari v${fromNumber}` : vendor} dirty={dirty} onClose={onClose}>
      <form onSubmit={submit} className="space-y-4 text-sm">
        {co && <label className="grid gap-1">Judul tambahan pekerjaan<input value={title} maxLength={120} required placeholder="Tambah 2 hari" onChange={(e) => setTitle(e.target.value)} /></label>}
        <div className="grid grid-cols-2 gap-2">
          <label className="grid gap-1">No. dokumen vendor<input value={ref} maxLength={80} onChange={(e) => setRef(e.target.value)} /></label>
          <label className="grid gap-1">Tanggal<input type="date" value={date} onChange={(e) => setDate(e.target.value)} /></label>
        </div>
        {correct && <label className="grid gap-1">Alasan koreksi (wajib)<textarea rows={2} required maxLength={500} value={reason} placeholder="mis. salah ketik harga" onChange={(e) => setReason(e.target.value)} /></label>}
        {secs.map((sec, si) => (
          <section key={sec.id} className="space-y-1.5" aria-label={`Bagian ${sec.name || si + 1}`}>
            <div className="flex flex-wrap items-center gap-1.5" style={{ borderBottom: "1px solid var(--line)", paddingBottom: "0.375rem" }}>
              <input data-k={`sec-${sec.id}`} aria-label="Nama bagian" placeholder="Nama bagian (opsional), mis. Studio Facilities" maxLength={60} className="min-w-0 font-semibold" style={{ flex: "1 1 14rem" }} value={sec.name} onChange={(e) => setSecs((x) => x.map((s, j) => (j === si ? { ...s, name: e.target.value } : s)))} onKeyDown={(e) => { if (e.key === "Enter" && !e.nativeEvent.isComposing) e.preventDefault(); }} />
              <b className="bg-amount ms-auto whitespace-nowrap" title="Subtotal bagian">{formatRupiah(secTotal(sec.rows))}</b>
              {secs.length > 1 && <button type="button" className="btn-ghost btn-icon" aria-label="Naikkan bagian" disabled={si === 0} onClick={() => moveSec(si, -1)}>↑</button>}
              {secs.length > 1 && <button type="button" className="btn-ghost btn-icon" aria-label="Turunkan bagian" disabled={si === secs.length - 1} onClick={() => moveSec(si, 1)}>↓</button>}
              {secs.length > 1 && <button type="button" className="btn-ghost btn-icon" aria-label="Hapus bagian" onClick={() => delSec(si)}><Icon name="close" /></button>}
            </div>
            {sec.rows.map((r, i) => {
              const counted = isCounted(r.kind), child = r.kind === "included" && hasPkg(sec.rows, r.parent);
              const a = amountOf(r), off = counted && r.qty.trim() === "0";
              return (
                <div key={r.key} className="bg-lines pb-2" onKeyDown={(e) => rowKey(e, si, i)} style={{ borderBottom: "1px solid var(--line)", ...(child ? { marginInlineStart: "1.25rem" } : {}), gridTemplateColumns: counted ? "4rem 4.5rem minmax(0, 1fr)" : "4rem minmax(0, 1fr)" }}>
                  <div className="flex flex-wrap items-center gap-1" style={{ gridColumn: "1 / -1" }}>
                    <select aria-label="Jenis baris" style={{ flex: "1 1 7rem", minWidth: 0, maxWidth: "12rem" }} value={r.kind} onChange={(e) => setKind(si, i, e.target.value as LineKind)}>{LINE_KINDS.map((k) => <option key={k} value={k}>{KIND_LABEL[k]}</option>)}</select>
                    {r.kind === "package" && <button type="button" className="btn-ghost" onClick={() => addChild(si, r)}>+ isi paket</button>}
                    <span className="ms-auto" />
                    <button type="button" className="btn-ghost btn-icon" aria-label="Naikkan baris" onClick={() => mapSec(si, (rows) => moveRow(rows, i, -1))}>↑</button>
                    <button type="button" className="btn-ghost btn-icon" aria-label="Turunkan baris" onClick={() => mapSec(si, (rows) => moveRow(rows, i, 1))}>↓</button>
                    <button type="button" className="btn-ghost btn-icon" aria-label="Hapus baris" onClick={() => delRow(si, i)}><Icon name="close" /></button>
                  </div>
                  <textarea rows={1} data-k={r.key} aria-invalid={bad?.k === r.key && bad.f === "item" || undefined} aria-label="Item" placeholder="Item (tempel dari spreadsheet: item, info, qty, satuan, harga)" className="bg-item" value={r.item} maxLength={200} onChange={(e) => set(si, i, { item: e.target.value })} onPaste={(e) => paste(e, si, i)} />
                  {r.kind !== "note" && <input data-k={`${r.key}-qty`} aria-invalid={bad?.k === r.key && bad.f === "qty" || undefined} aria-label="Qty" placeholder="mis. 2,5" inputMode="decimal" value={r.qty} onChange={(e) => set(si, i, { qty: e.target.value })} />}
                  {r.kind !== "note" && <input aria-label="Satuan" placeholder="Satuan" value={r.unit} maxLength={20} onChange={(e) => set(si, i, { unit: e.target.value })} />}
                  {counted && <input data-k={`${r.key}-price`} aria-invalid={bad?.k === r.key && bad.f === "price" || undefined} aria-label="Harga satuan" inputMode="numeric" placeholder="Harga satuan" value={r.price} onChange={(e) => set(si, i, { price: e.target.value })} />}
                  {counted && <span className="bg-amount" style={{ gridColumn: "1 / -1" }}>{off ? <span className="muted text-xs">tidak diambil</span> : a == null ? "—" : formatRupiah(a)}</span>}
                  {r.kind === "note" && <select aria-label="Status harga" style={{ gridColumn: "1 / -1" }} value={r.state} onChange={(e) => set(si, i, { state: e.target.value as Row["state"] })}><option value="">Info saja</option>{(Object.keys(PRICE_STATE) as (keyof typeof PRICE_STATE)[]).map((k) => <option key={k} value={k}>{PRICE_STATE[k]}</option>)}</select>}
                  <input aria-label="Info" placeholder={r.kind === "included" ? "Info / status (opsional)" : "Info (opsional)"} maxLength={200} value={r.info} style={{ gridColumn: "1 / -1" }} onChange={(e) => set(si, i, { info: e.target.value })} />
                  {r.orig && r.item.trim() !== r.orig && <span className="muted text-xs" style={{ gridColumn: "1 / -1" }}>Deliverable: {r.orig}</span>}
                </div>
              );
            })}
            {sec.rows.length === 0 && <p className="muted text-sm">Belum ada baris.</p>}
            <button type="button" className="btn-ghost" onClick={() => addRow(si)}>+ Baris di bagian ini</button>
          </section>
        ))}
        <div className="flex flex-wrap gap-2">
          <button type="button" className="btn-secondary" onClick={addSection}>Tambah bagian</button>
          {unseeded.length > 0 && <button type="button" className="btn-ghost" onClick={fillSeeds}>Isi dari deliverable</button>}
        </div>
        <p className="muted text-xs">Item dan Paket dihitung (qty × harga; qty 0 = tidak diambil). Termasuk paket dan Catatan tidak dihitung. Harga satuan boleh negatif untuk baris diskon.{negative && " Total tambahan boleh negatif (pengurangan)."}</p>
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
