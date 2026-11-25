"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { removeInvoice, removePayment, saveInvoice, savePayment } from "@/app/admin/budget-actions";
import { ConfirmButton, Drawer } from "@/components/ui/controls";
import { Icon } from "@/components/ui/icons";
import { useToast } from "@/components/ui/toast";
import { PPN_LABEL, TAX_NOTE } from "@/lib/budget/catalog";
import { formatRateBp, formatRupiah, MoneyError, parseRateBp, parseRupiah, plainRupiah, taxOf } from "@/lib/budget/money";
import { invoiceState } from "@/lib/budget/rollup";

export type PayRow = { id: string; paidOn: string; amount: number; note: string; link: string };
export type InvoiceRow = {
  id: string; scopeId: string; scope: string; vendorId: string; vendor: string; docId: string | null; termin: string; ref: string;
  issueDate: string | null; dueDate: string | null; subtotal: number; ppnRateBp: number | null; ppn: number; pph23RateBp: number | null; pph23: number;
  status: "planned" | "received" | "cancelled"; links: string[]; notes: string; offChosen: boolean; payments: PayRow[];
};
export type DocOption = { id: string; label: string };
const STATUS = { planned: "Rencana", received: "Diterima", cancelled: "Dibatalkan" } as const;
const msg = (e: unknown) => (e instanceof MoneyError ? e.message : "Data tidak valid.");

export const invState = (i: InvoiceRow, today: string) => {
  const st = invoiceState(i, i.payments);
  return { ...st, overdue: i.status !== "cancelled" && !st.lunas && !!i.dueDate && i.dueDate < today };
};

export function InvoiceTags({ inv, today }: { inv: InvoiceRow; today: string }) {
  const st = invState(inv, today);
  return (
    <>
      <span className={`tag ${inv.status === "received" ? "tag-ok" : ""}`}>{STATUS[inv.status]}</span>
      {st.lunas && inv.status === "received" && <span className="tag tag-ok">Lunas</span>}
      {st.overpaid > 0 && <span className="tag tag-warn">kelebihan bayar</span>}
      {st.overdue && <span className="tag tag-danger">Jatuh tempo</span>}
      {inv.offChosen && inv.status !== "cancelled" && <span className="tag tag-warn">bukan vendor terpilih</span>}
    </>
  );
}

/** Add / edit one invoice. Taxes default from the vendor; the live net is a preview, the server freezes the real figures. */
export function InvoiceDrawer({ slug, scopeId, vendorId, vendor, ppnBp, pph23Bp, docs, init, onClose }: { slug: string; scopeId: string; vendorId: string; vendor: string; ppnBp: number | null; pph23Bp: number | null; docs: DocOption[]; init?: InvoiceRow; onClose: () => void }) {
  const toast = useToast();
  const router = useRouter();
  const [f, setF] = useState({ termin: init?.termin ?? "", ref: init?.ref ?? "", status: init?.status ?? "planned", issueDate: init?.issueDate ?? "", dueDate: init?.dueDate ?? "", docId: init?.docId ?? "", notes: init?.notes ?? "", links: (init?.links ?? []).join("\n") });
  const [subtotal, setSubtotal] = useState(init ? plainRupiah(init.subtotal) : "");
  const [ppn, setPpn] = useState(formatRateBp(init ? init.ppnRateBp : ppnBp));
  const [pph, setPph] = useState(formatRateBp(init ? init.pph23RateBp : pph23Bp));
  const [busy, setBusy] = useState(false);
  const [first] = useState(() => JSON.stringify([f, subtotal, ppn, pph]));
  const dirty = JSON.stringify([f, subtotal, ppn, pph]) !== first;
  let tax = taxOf(0, null, null);
  try { tax = taxOf(subtotal.trim() ? parseRupiah(subtotal) : 0, parseRateBp(ppn), parseRateBp(pph)); } catch { /* shown on save */ }
  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      const sub = parseRupiah(subtotal);
      setBusy(true);
      const r = await saveInvoice(slug, init?.id ?? null, { scopeId, vendorId, docId: f.docId || null, termin: f.termin, ref: f.ref, issueDate: f.issueDate, dueDate: f.dueDate, subtotal: sub, ppnBp: parseRateBp(ppn), pph23Bp: parseRateBp(pph), status: f.status, links: f.links.split("\n").map((l) => l.trim()).filter(Boolean), notes: f.notes });
      setBusy(false);
      if (!r.ok) { toast({ message: r.error, tone: "error" }); return; }
      toast({ message: "Tagihan disimpan." });
      onClose();
      router.refresh();
    } catch (x) { setBusy(false); toast({ message: msg(x), tone: "error" }); }
  };
  return (
    <Drawer title={init ? "Ubah tagihan" : "Tagihan baru"} crumb={vendor} dirty={dirty} onClose={onClose}>
      <form onSubmit={submit} className="space-y-4 text-sm">
        <div className="grid grid-cols-2 gap-2">
          <label className="grid gap-1">Termin<input value={f.termin} maxLength={80} required placeholder="DP 50%" onChange={(e) => setF({ ...f, termin: e.target.value })} /></label>
          <label className="grid gap-1">No. invoice<input value={f.ref} maxLength={80} onChange={(e) => setF({ ...f, ref: e.target.value })} /></label>
        </div>
        <label className="grid gap-1">Status
          <select value={f.status} onChange={(e) => setF({ ...f, status: e.target.value as InvoiceRow["status"] })}>{Object.entries(STATUS).map(([k, l]) => <option key={k} value={k}>{k === "planned" ? "Rencana (belum ada invoice)" : k === "received" ? "Diterima (invoice nyata)" : l}</option>)}</select>
        </label>
        <div className="grid grid-cols-2 gap-2">
          <label className="grid gap-1">Tanggal invoice<input type="date" value={f.issueDate} onChange={(e) => setF({ ...f, issueDate: e.target.value })} /></label>
          <label className="grid gap-1">Jatuh tempo<input type="date" value={f.dueDate} onChange={(e) => setF({ ...f, dueDate: e.target.value })} /></label>
        </div>
        <label className="grid gap-1">Subtotal, sebelum pajak (Rp)<input inputMode="numeric" required value={subtotal} onChange={(e) => setSubtotal(e.target.value)} /></label>
        <div className="grid grid-cols-2 gap-2">
          <label className="grid gap-1">{PPN_LABEL} (%, kosong = tanpa)<input inputMode="decimal" value={ppn} onChange={(e) => setPpn(e.target.value)} /></label>
          <label className="grid gap-1">PPh 23 (%, kosong = tanpa)<input inputMode="decimal" value={pph} onChange={(e) => setPph(e.target.value)} /></label>
        </div>
        <dl className="grid grid-cols-[1fr_auto] gap-x-4 gap-y-1 tabular-nums">
          <dt>Perkiraan PPN</dt><dd className="bg-amount">{formatRupiah(tax.ppn)}</dd>
          <dt>Perkiraan PPh 23</dt><dd className="bg-amount">{formatRupiah(-tax.pph23)}</dd>
          <dt className="font-medium">Perkiraan net dibayar</dt><dd className="bg-amount font-medium">{formatRupiah(tax.net)}</dd>
        </dl>
        <p className="muted text-xs">{TAX_NOTE}</p>
        {docs.length > 0 && <label className="grid gap-1">Merujuk dokumen (opsional)
          <select value={f.docId} onChange={(e) => setF({ ...f, docId: e.target.value })}><option value="">—</option>{docs.map((d) => <option key={d.id} value={d.id}>{d.label}</option>)}</select>
        </label>}
        <label className="grid gap-1">Catatan<textarea rows={2} value={f.notes} maxLength={1000} onChange={(e) => setF({ ...f, notes: e.target.value })} /></label>
        <label className="grid gap-1">Link (satu per baris, maks. 5, http/https)<textarea rows={2} value={f.links} onChange={(e) => setF({ ...f, links: e.target.value })} /></label>
        <button className="btn" disabled={busy}>{busy ? "Menyimpan…" : "Simpan tagihan"}</button>
      </form>
    </Drawer>
  );
}

/** Payments of one invoice: list, delete, and add (amount defaults to the remaining net). */
export function PaymentDrawer({ slug, inv, canEdit, today, onClose }: { slug: string; inv: InvoiceRow; canEdit: boolean; today: string; onClose: () => void }) {
  const toast = useToast();
  const router = useRouter();
  const st = invoiceState(inv, inv.payments);
  const [paidOn, setPaidOn] = useState(today);
  const [amount, setAmount] = useState(st.remaining ? plainRupiah(st.remaining) : "");
  const [note, setNote] = useState("");
  const [link, setLink] = useState("");
  const [busy, setBusy] = useState(false);
  const parse = () => { try { return amount.trim() ? parseRupiah(amount) : 0; } catch { return 0; } };
  const n = parse();
  const done = async (p: Promise<{ ok: boolean; error?: string }>, ok: string) => {
    const r = await p;
    toast(r.ok ? { message: ok } : { message: r.error ?? "Gagal.", tone: "error" });
    if (r.ok) router.refresh();
    return r.ok;
  };
  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    let amt = 0;
    try { amt = parseRupiah(amount); } catch (x) { toast({ message: msg(x), tone: "error" }); return; }
    if (amt <= 0) { toast({ message: "Jumlah bayar harus lebih dari 0.", tone: "error" }); return; }
    setBusy(true);
    const ok = await done(savePayment(slug, inv.id, { paidOn, amount: amt, note, link }), "Pembayaran dicatat.");
    setBusy(false);
    if (ok) onClose();
  };
  return (
    <Drawer title={`Pembayaran: ${inv.termin}`} crumb={inv.vendor} onClose={onClose}>
      <div className="space-y-4 text-sm">
        <dl className="grid grid-cols-[1fr_auto] gap-x-4 gap-y-1 tabular-nums">
          <dt>Net tagihan (perkiraan)</dt><dd className="bg-amount">{formatRupiah(st.net)}</dd>
          <dt>Sudah dibayar</dt><dd className="bg-amount">{formatRupiah(st.cash)}</dd>
          <dt className="font-medium">Sisa</dt><dd className="bg-amount font-medium">{formatRupiah(st.remaining)}</dd>
        </dl>
        <p>{st.lunas && <span className="tag tag-ok">Lunas</span>} {st.overpaid > 0 && <span className="tag tag-warn">kelebihan bayar {formatRupiah(st.overpaid)}</span>}</p>
        {inv.payments.length > 0 && (
          <ul className="rows">
            {inv.payments.map((p) => (
              <li key={p.id} className="flex flex-wrap items-center gap-2">
                <span className="tabular-nums">{p.paidOn}</span><span className="tabular-nums font-medium">{formatRupiah(p.amount)}</span>
                <span className="muted grow">{p.note}</span>
                {p.link && <a href={p.link} target="_blank" rel="noreferrer noopener" className="underline">Bukti</a>}
                {canEdit && <form action={async () => { await done(removePayment(slug, p.id), "Pembayaran dihapus."); }}><ConfirmButton className="btn-ghost btn-icon" aria-label="Hapus pembayaran" message="Hapus pembayaran ini?"><Icon name="close" /></ConfirmButton></form>}
              </li>
            ))}
          </ul>
        )}
        {canEdit && inv.status === "received" && (
          <form onSubmit={submit} className="space-y-3">
            <div className="grid grid-cols-2 gap-2">
              <label className="grid gap-1">Tanggal bayar<input type="date" required value={paidOn} onChange={(e) => setPaidOn(e.target.value)} /></label>
              <label className="grid gap-1">Jumlah ditransfer (Rp)<input inputMode="numeric" required value={amount} onChange={(e) => setAmount(e.target.value)} /></label>
            </div>
            <label className="grid gap-1">Catatan<input value={note} maxLength={500} onChange={(e) => setNote(e.target.value)} /></label>
            <label className="grid gap-1">Link bukti transfer (opsional)<input value={link} maxLength={500} onChange={(e) => setLink(e.target.value)} /></label>
            <button className="btn" disabled={busy || n <= 0}>{busy ? "Menyimpan…" : "Catat pembayaran"}</button>
          </form>
        )}
        {canEdit && inv.status !== "received" && <p className="muted">Tandai tagihan sebagai Diterima untuk mencatat pembayaran.</p>}
      </div>
    </Drawer>
  );
}

/** The termin table of one bid, with add / edit / pay. Read-only for assistants. */
export function InvoiceTable({ slug, canEdit, today, invoices, scopeId, vendorId, vendor, ppnBp, pph23Bp, docs }: { slug: string; canEdit: boolean; today: string; invoices: InvoiceRow[]; scopeId: string; vendorId: string; vendor: string; ppnBp: number | null; pph23Bp: number | null; docs: DocOption[] }) {
  const toast = useToast();
  const router = useRouter();
  const [edit, setEdit] = useState<InvoiceRow | "new" | null>(null);
  const [pay, setPay] = useState<string | null>(null);
  const payInv = invoices.find((i) => i.id === pay);
  return (
    <section className="space-y-2">
      <div className="flex flex-wrap items-center gap-2">
        <h3 className="text-sm font-semibold">Tagihan & termin</h3>
        {canEdit && <button type="button" className="btn-secondary" onClick={() => setEdit("new")}>Tambah termin</button>}
      </div>
      {invoices.length === 0 ? <p className="muted text-sm">Belum ada termin atau tagihan.</p> : (
        <div className="overflow-x-auto">
          <table className="table w-full text-sm">
            <thead><tr><th className="text-start">Termin</th><th className="text-start">No.</th><th className="text-start">Jatuh tempo</th><th className="bg-num">Subtotal</th><th className="bg-num">PPN</th><th className="bg-num">PPh 23</th><th className="bg-num">Net</th><th className="bg-num">Dibayar</th><th className="bg-num">Sisa</th><th className="text-start">Status</th><th /></tr></thead>
            <tbody>
              {invoices.map((i) => {
                const st = invState(i, today);
                return (
                  <tr key={i.id}>
                    <td className="font-medium">{i.termin}</td>
                    <td>{i.ref || "—"}</td>
                    <td className={`tabular-nums ${st.overdue ? "text-danger" : ""}`}>{i.dueDate ?? "—"}</td>
                    <td className="bg-num">{formatRupiah(i.subtotal)}</td>
                    <td className="bg-num">{formatRupiah(i.ppn)}</td>
                    <td className="bg-num">{formatRupiah(i.pph23)}</td>
                    <td className="bg-num">{formatRupiah(st.net)}</td>
                    <td className="bg-num">{formatRupiah(st.cash)}</td>
                    <td className="bg-num">{formatRupiah(st.remaining)}</td>
                    <td><InvoiceTags inv={i} today={today} /></td>
                    <td className="whitespace-nowrap">
                      <button type="button" className="btn-ghost" onClick={() => setPay(i.id)}>{canEdit && i.status === "received" ? "Bayar" : "Pembayaran"}</button>
                      {canEdit && <button type="button" className="btn-ghost" onClick={() => setEdit(i)}>Ubah</button>}
                      {canEdit && <form className="inline" action={async () => { const r = await removeInvoice(slug, i.id); toast(r.ok ? { message: "Tagihan dihapus." } : { message: r.error, tone: "error" }); if (r.ok) router.refresh(); }}><ConfirmButton className="btn-ghost" pendingLabel="Menyimpan…" message={`Hapus tagihan "${i.termin}"?`}>Hapus</ConfirmButton></form>}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
      <p className="muted text-xs">Pajak adalah perkiraan. {TAX_NOTE} Dibayar dan Sisa dihitung dari net.</p>
      {edit && <InvoiceDrawer key={edit === "new" ? "new" : edit.id} slug={slug} scopeId={scopeId} vendorId={vendorId} vendor={vendor} ppnBp={ppnBp} pph23Bp={pph23Bp} docs={docs} init={edit === "new" ? undefined : edit} onClose={() => setEdit(null)} />}
      {payInv && <PaymentDrawer key={payInv.id} slug={slug} inv={payInv} canEdit={canEdit} today={today} onClose={() => setPay(null)} />}
    </section>
  );
}

/** "Tagihan" tab of the summary: every invoice of the project by due date, with filters. */
export function InvoiceList({ slug, invoices, today }: { slug: string; invoices: InvoiceRow[]; today: string }) {
  const [status, setStatus] = useState("");
  const [vendor, setVendor] = useState("");
  const vendors = [...new Map(invoices.map((i) => [i.vendorId, i.vendor])).entries()];
  const shown = invoices.filter((i) => (!status || (status === "lunas" ? invState(i, today).lunas && i.status === "received" : status === "overdue" ? invState(i, today).overdue : i.status === status)) && (!vendor || i.vendorId === vendor));
  if (invoices.length === 0) return <p className="muted text-sm">Belum ada tagihan. Tambahkan termin dari halaman lingkup.</p>;
  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-2">
        <select aria-label="Filter status" value={status} onChange={(e) => setStatus(e.target.value)}>
          <option value="">Semua status</option><option value="planned">Rencana</option><option value="received">Diterima</option><option value="cancelled">Dibatalkan</option><option value="overdue">Jatuh tempo</option><option value="lunas">Lunas</option>
        </select>
        <select aria-label="Filter vendor" value={vendor} onChange={(e) => setVendor(e.target.value)}>
          <option value="">Semua vendor</option>{vendors.map(([id, n]) => <option key={id} value={id}>{n}</option>)}
        </select>
      </div>
      <div className="overflow-x-auto">
        <table className="table w-full text-sm">
          <thead><tr><th className="text-start">Jatuh tempo</th><th className="text-start">Lingkup</th><th className="text-start">Vendor</th><th className="text-start">Termin</th><th className="text-start">No.</th><th className="bg-num">Net</th><th className="bg-num">Dibayar</th><th className="bg-num">Sisa</th><th className="text-start">Status</th></tr></thead>
          <tbody>
            {shown.map((i) => {
              const st = invState(i, today);
              return (
                <tr key={i.id}>
                  <td className={`tabular-nums ${st.overdue ? "text-danger" : ""}`}>{i.dueDate ?? "—"}</td>
                  <td><Link href={`/admin/p/${slug}/budget/scope/${i.scopeId}`} className="underline">{i.scope}</Link></td>
                  <td>{i.vendor}</td>
                  <td className="font-medium">{i.termin}</td>
                  <td>{i.ref || "—"}</td>
                  <td className="bg-num">{formatRupiah(st.net)}</td>
                  <td className="bg-num">{formatRupiah(st.cash)}</td>
                  <td className="bg-num">{formatRupiah(st.remaining)}</td>
                  <td><InvoiceTags inv={i} today={today} /></td>
                </tr>
              );
            })}
            {shown.length === 0 && <tr><td colSpan={9} className="muted">Tidak ada tagihan yang cocok.</td></tr>}
          </tbody>
        </table>
      </div>
    </div>
  );
}
