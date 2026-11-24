"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { saveScope } from "@/app/admin/budget-actions";
import { Drawer } from "@/components/ui/controls";
import { useToast } from "@/components/ui/toast";
import { categoryLabel, SERVICE_CATEGORIES, TAX_NOTE } from "@/lib/budget/catalog";
import { formatRupiah, MoneyError, parseRupiah } from "@/lib/budget/money";
import { VendorPanel, type VendorRow } from "./VendorPanel";

export type ScopeRow = { id: string; name: string; category: string; budget: number; chosen: number; state: string; variance: number; vendor: string | null; cancelled: boolean };
export type Option = { id: string; name: string };
export type ScopeForm = { id: string | null; name: string; category: string; budget: number; phaseIds: string[]; deliverableIds: string[]; notes: string };

const msg = (e: unknown) => (e instanceof MoneyError ? e.message : "Data tidak valid.");

export function ScopeDrawer({ slug, init, phases, deliverables, onClose }: { slug: string; init: ScopeForm; phases: Option[]; deliverables: Option[]; onClose: () => void }) {
  const toast = useToast();
  const router = useRouter();
  const [f, setF] = useState(init);
  const [budget, setBudget] = useState(init.budget ? String(init.budget) : "");
  const [busy, setBusy] = useState(false);
  const toggle = (k: "phaseIds" | "deliverableIds", id: string) => setF((x) => ({ ...x, [k]: x[k].includes(id) ? x[k].filter((i) => i !== id) : [...x[k], id] }));
  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    let amount = 0;
    try { amount = budget.trim() ? parseRupiah(budget) : 0; } catch (x) { toast({ message: msg(x), tone: "error" }); return; }
    setBusy(true);
    const r = await saveScope(slug, f.id, { name: f.name, category: f.category, budget: amount, phaseIds: f.phaseIds, deliverableIds: f.deliverableIds, notes: f.notes });
    setBusy(false);
    if (!r.ok) { toast({ message: r.error, tone: "error" }); return; }
    toast({ message: "Lingkup disimpan." });
    onClose();
    router.refresh();
  };
  return (
    <Drawer title={f.id ? "Ubah lingkup" : "Tambah lingkup"} crumb="Anggaran & vendor" onClose={onClose}>
      <form onSubmit={submit} className="space-y-4 text-sm">
        <label className="grid gap-1">Nama lingkup<input value={f.name} maxLength={120} required onChange={(e) => setF({ ...f, name: e.target.value })} /></label>
        <label className="grid gap-1">Kategori
          <select value={f.category} onChange={(e) => setF({ ...f, category: e.target.value })}>{Object.entries(SERVICE_CATEGORIES).map(([k, l]) => <option key={k} value={k}>{l}</option>)}</select>
        </label>
        <label className="grid gap-1">Budget target, sebelum pajak (Rp)<input inputMode="numeric" placeholder="150.000.000" value={budget} onChange={(e) => setBudget(e.target.value)} /></label>
        <fieldset className="grid gap-1"><legend className="mb-1">Fase terkait</legend>
          {phases.length === 0 && <p className="muted">Belum ada fase di timeline.</p>}
          {phases.map((p) => <label key={p.id} className="flex items-center gap-2"><input type="checkbox" checked={f.phaseIds.includes(p.id)} onChange={() => toggle("phaseIds", p.id)} />{p.name}</label>)}
        </fieldset>
        <fieldset className="grid gap-1"><legend className="mb-1">Deliverable terkait</legend>
          {deliverables.length === 0 && <p className="muted">Belum ada deliverable.</p>}
          {deliverables.map((p) => <label key={p.id} className="flex items-center gap-2"><input type="checkbox" checked={f.deliverableIds.includes(p.id)} onChange={() => toggle("deliverableIds", p.id)} />{p.name}</label>)}
        </fieldset>
        <label className="grid gap-1">Catatan<textarea rows={3} value={f.notes} maxLength={2000} onChange={(e) => setF({ ...f, notes: e.target.value })} /></label>
        <button className="btn" disabled={busy}>{busy ? "Menyimpan…" : "Simpan"}</button>
      </form>
    </Drawer>
  );
}

export function BudgetView({ slug, canEdit, rows, total, phases, deliverables, vendors, contacts }: {
  slug: string; canEdit: boolean; rows: ScopeRow[]; total: { budget: number; chosen: number; provisional: boolean };
  phases: Option[]; deliverables: Option[]; vendors: VendorRow[]; contacts: Option[];
}) {
  const [tab, setTab] = useState<"sum" | "vendor">("sum");
  const [adding, setAdding] = useState(false);
  const over = (n: number) => (n < 0 ? "text-danger" : "");
  return (
    <section className="space-y-4">
      <div className="flex flex-wrap items-center gap-3">
        <div className="seg" role="group" aria-label="Tampilan anggaran">
          <button type="button" aria-pressed={tab === "sum"} onClick={() => setTab("sum")}>Ringkasan</button>
          <button type="button" aria-pressed={tab === "vendor"} onClick={() => setTab("vendor")}>Vendor</button>
        </div>
        {tab === "sum" && canEdit && rows.length > 0 && <button type="button" className="btn-secondary" onClick={() => setAdding(true)}>Tambah lingkup</button>}
      </div>
      {tab === "sum" && (rows.length === 0 ? (
        <div className="space-y-3">
          <p className="muted text-sm">Belum ada lingkup. Mulai dengan satu lingkup pekerjaan, misalnya Grading, lalu tambahkan vendor dan penawarannya.</p>
          {canEdit && <button type="button" className="btn" onClick={() => setAdding(true)}>Tambah lingkup</button>}
        </div>
      ) : (
        <>
          <div className="muted text-sm"><p>Semua angka sebelum pajak (DPP).</p><details><summary className="cursor-pointer underline">Soal pajak</summary><p>Pajak hanya perkiraan: PPN efektif 11% (12% atas DPP nilai lain 11/12) dan PPh 23 2% dari jumlah sebelum PPN, tergantung vendor. {TAX_NOTE} Rinciannya ada di tiap versi penawaran.</p></details></div>
          <div className="overflow-x-auto">
            <table className="table w-full text-sm">
              <thead><tr><th className="text-start">Lingkup</th><th className="bg-num">Budget</th><th className="bg-num">Dipilih</th><th className="bg-num">Selisih</th><th className="text-start">Vendor terpilih</th></tr></thead>
              <tbody>
                {rows.map((r) => (
                  <tr key={r.id}>
                    <td><Link href={`/admin/p/${slug}/budget/scope/${r.id}`} className="font-medium underline">{r.name}</Link> <span className="muted">{categoryLabel(r.category)}</span></td>
                    <td className="bg-num">{formatRupiah(r.budget)}</td>
                    <td className="bg-num">{r.state === "none" ? <span className="muted">Belum dipilih</span> : <>{formatRupiah(r.chosen)} {r.state === "provisional" ? <><span className="tag tag-warn">perkiraan</span>{r.cancelled && <span className="tag tag-warn">persetujuan dibatalkan</span>}</> : <span className="tag tag-ok">{r.state === "pinned" ? "Terpilih" : "Disetujui"}</span>}</>}</td>
                    <td className={`bg-num ${r.state === "none" ? "muted" : over(r.variance)}`}>{r.state === "none" ? "—" : formatRupiah(r.variance)}</td>
                    <td>{r.vendor ?? <span className="muted">Belum dipilih</span>}</td>
                  </tr>
                ))}
              </tbody>
              <tfoot><tr className="font-medium">
                <td>Total</td><td className="bg-num">{formatRupiah(total.budget)}</td>
                <td className="bg-num">{formatRupiah(total.chosen)} {total.provisional && <span className="tag tag-warn">perkiraan</span>}</td>
                <td className={`bg-num ${over(total.budget - total.chosen)}`}>{formatRupiah(total.budget - total.chosen)}</td><td />
              </tr></tfoot>
            </table>
          </div>
        </>
      ))}
      {tab === "vendor" && <VendorPanel slug={slug} canEdit={canEdit} vendors={vendors} contacts={contacts} />}
      {adding && <ScopeDrawer slug={slug} init={{ id: null, name: "", category: "other", budget: 0, phaseIds: [], deliverableIds: [], notes: "" }} phases={phases} deliverables={deliverables} onClose={() => setAdding(false)} />}
    </section>
  );
}
