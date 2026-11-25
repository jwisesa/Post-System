"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { saveScope } from "@/app/admin/budget-actions";
import { Drawer } from "@/components/ui/controls";
import { Icon } from "@/components/ui/icons";
import { ExportMenu, type ExportItem } from "./ExportMenu";
import { useToast } from "@/components/ui/toast";
import { categoryLabel, SERVICE_CATEGORIES, TAX_NOTE } from "@/lib/budget/catalog";
import { fmt, MoneyError, parseRupiah, plainRupiah } from "@/lib/budget/money";
import { ScenarioTab, type ScenarioInfo, type PickScope } from "./ScenarioTab";
import type { Comparison } from "@/lib/budget/scenarios";
import { DriveTab, type DriveProps } from "./DriveTab";
import { InvoiceList, type InvoiceRow } from "./InvoiceParts";
import { VendorPanel, type VendorRow } from "./VendorPanel";

export type ScopeRow = { id: string; name: string; category: string; budget: number; chosen: number; invoiced: number; paid: number; overInvoiced: number; overpaid: number; state: string; variance: number; vendor: string | null; cancelled: boolean; drives: number };
export type Option = { id: string; name: string };
export type ScopeForm = { id: string | null; name: string; category: string; budget: number; phaseIds: string[]; deliverableIds: string[]; notes: string };

const msg = (e: unknown) => (e instanceof MoneyError ? e.message : "Data tidak valid.");

export function ScopeDrawer({ slug, init, phases, deliverables, onClose }: { slug: string; init: ScopeForm; phases: Option[]; deliverables: Option[]; onClose: () => void }) {
  const toast = useToast();
  const router = useRouter();
  const [f, setF] = useState(init);
  const [budget, setBudget] = useState(init.budget ? plainRupiah(init.budget) : "");
  const [busy, setBusy] = useState(false);
  const dirty = JSON.stringify(f) !== JSON.stringify(init) || budget !== (init.budget ? plainRupiah(init.budget) : "");
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
    <Drawer title={f.id ? "Ubah lingkup" : "Tambah lingkup"} crumb="Anggaran & vendor" dirty={dirty} onClose={onClose}>
      <form onSubmit={submit} className="space-y-4 text-sm">
        <label className="grid gap-1">Nama lingkup<input value={f.name} maxLength={120} required onChange={(e) => setF({ ...f, name: e.target.value })} /></label>
        <label className="grid gap-1">Kategori
          <select value={f.category} onChange={(e) => setF({ ...f, category: e.target.value })}>{Object.entries(SERVICE_CATEGORIES).map(([k, l]) => <option key={k} value={k}>{l}</option>)}</select>
        </label>
        <label className="grid gap-1">Budget target, sebelum pajak (Rp)<input inputMode="numeric" placeholder="150.000.000" value={budget} onChange={(e) => setBudget(e.target.value)} /></label>
        <fieldset className="grid gap-1"><legend className="mb-1">Fase terkait</legend>
          {phases.length === 0 && <p className="muted">Belum ada fase di timeline.</p>}
          <div className="grid max-h-56 gap-1 overflow-y-auto">{phases.map((p) => <label key={p.id} className="flex items-center gap-2"><input type="checkbox" checked={f.phaseIds.includes(p.id)} onChange={() => toggle("phaseIds", p.id)} />{p.name}</label>)}</div>
        </fieldset>
        <fieldset className="grid gap-1"><legend className="mb-1">Deliverable terkait</legend>
          {deliverables.length === 0 && <p className="muted">Belum ada deliverable.</p>}
          <div className="grid max-h-56 gap-1 overflow-y-auto">{deliverables.map((p) => <label key={p.id} className="flex items-center gap-2"><input type="checkbox" checked={f.deliverableIds.includes(p.id)} onChange={() => toggle("deliverableIds", p.id)} />{p.name}</label>)}</div>
        </fieldset>
        <label className="grid gap-1">Catatan<textarea rows={3} value={f.notes} maxLength={2000} onChange={(e) => setF({ ...f, notes: e.target.value })} /></label>
        <button className="btn" disabled={busy}>{busy ? "Menyimpan…" : "Simpan"}</button>
      </form>
    </Drawer>
  );
}

export type BudgetTab = "sum" | "bills" | "vendor" | "drive" | "plans";
export const TAB_PARAM: Record<BudgetTab, string> = { sum: "ringkasan", bills: "bills", vendor: "vendor", drive: "drive", plans: "rencana" };
const TAB_LABEL: Record<BudgetTab, string> = { sum: "Ringkasan", bills: "Tagihan", vendor: "Vendor", drive: "Hard drive", plans: "Rencana" };

/** Per-recap exports: each tab exports only its own data. */
const exportsFor = (slug: string, tab: BudgetTab): ExportItem[] => {
  const csv = (type: string, label: string): ExportItem => ({ href: `/admin/p/${slug}/budget/export?type=${type}`, label, kind: "csv" });
  const pdf = (view: string, label: string): ExportItem => ({ href: `/admin/p/${slug}/budget/print?view=${view}`, label, kind: "pdf" });
  return { sum: [csv("scopes", "CSV lingkup"), pdf("ringkasan", "PDF ringkasan")], bills: [csv("invoices", "CSV tagihan"), pdf("tagihan", "PDF tagihan")], vendor: [csv("vendors", "CSV vendor")], drive: [csv("drives", "CSV belanja drive"), pdf("drives", "PDF belanja drive")], plans: [csv("scenarios", "CSV perbandingan rencana"), pdf("rencana", "PDF rencana")] }[tab];
};

export function BudgetView({ slug, canEdit, today, invoices, rows, total, phases, deliverables, vendors, contacts, drive, plans, tab }: {
  plans: { scenarioName: string | null; scenarios: ScenarioInfo[]; cmp: Comparison; scopes: PickScope[]; live: { invoiced: number; paid: number } }; tab: BudgetTab;
  drive: Omit<DriveProps, "slug" | "canEdit">;
  slug: string; canEdit: boolean; rows: ScopeRow[]; total: { budget: number; chosen: number; invoiced: number; paid: number; overpaid: number; provisional: boolean }; today: string; invoices: InvoiceRow[];
  phases: Option[]; deliverables: Option[]; vendors: VendorRow[]; contacts: Option[];
}) {
  const [adding, setAdding] = useState(false);
  const dash = <span className="muted">—</span>;
  const money = (n: number) => (n === 0 ? dash : fmt(n));
  const picked = rows.filter((r) => r.state !== "none" || r.drives > 0);
  const totalVar = picked.reduce((n, r) => n + r.variance, 0);
  const tabHref = (t: BudgetTab) => `?tab=${TAB_PARAM[t]}`;
  const stage = (r: ScopeRow) => r.state === "approved" ? <span className="tag tag-ok">Disetujui</span> : r.state === "pinned" ? <span className="tag">Masuk budget</span> : r.state === "provisional" ? <><span className="tag tag-warn">Masuk budget · perkiraan</span>{r.cancelled && <span className="tag tag-warn ms-1">persetujuan dibatalkan</span>}</> : null;
  return (
    <section className="space-y-4">
      <header className="page-head">
        <div>
          <h1 className="page-title">Anggaran & vendor</h1>
          <p className="page-meta">Budget per lingkup, penawaran vendor, dan versinya. Angka sebelum pajak.{plans.scenarioName && <> <Link href={tabHref("plans")} replace scroll={false} className="tag" title="Buka tab Rencana">Rencana: {plans.scenarioName}</Link></>}</p>
        </div>
        <div className="page-actions">
          {tab === "sum" && canEdit && rows.length > 0 && <button type="button" className="btn-secondary" onClick={() => setAdding(true)}>Tambah lingkup</button>}
          <ExportMenu key={tab} items={exportsFor(slug, tab)} />
        </div>
      </header>
      <nav className="seg bg-tabs" aria-label="Tampilan anggaran">
        {(Object.keys(TAB_LABEL) as BudgetTab[]).map((t) => (
          <Link key={t} href={tabHref(t)} replace scroll={false} aria-current={tab === t ? "page" : undefined}>{TAB_LABEL[t]}</Link>
        ))}
      </nav>
      {tab === "sum" && (rows.length === 0 ? (
        <div className="space-y-4">
          <ol className="bg-steps">
            {[["Lingkup", "Satu jenis pekerjaan beserta budget targetnya, misalnya Grading."], ["Vendor", "Siapa saja yang bisa mengerjakannya. Tambahkan di tab Vendor atau langsung dari lingkup."], ["Penawaran", "Catat tiap versi penawaran vendor, lalu masukkan yang terpilih ke budget."]].map(([h, t], i) => (
              <li key={h}><span className="bg-step-n" aria-hidden>{i + 1}</span><span><span className="block font-semibold">{h}</span><span className="text-ink-2 text-[13px]">{t}</span></span></li>
            ))}
          </ol>
          {canEdit ? <button type="button" className="btn" onClick={() => setAdding(true)}>Tambah lingkup</button> : <p className="muted text-sm">Belum ada lingkup.</p>}
        </div>
      ) : (
        <>
          <div className="muted text-sm"><p>Semua angka sebelum pajak (DPP). Dipilih = penawaran + tambahan pekerjaan disetujui. Dibayar = bagian sebelum pajak dari tagihan diterima yang sudah dibayar.</p><details><summary className="cursor-pointer underline">Soal pajak</summary><p>Pajak hanya perkiraan: PPN efektif 11% (12% atas DPP nilai lain 11/12) dan PPh 23 2% dari jumlah sebelum PPN, tergantung vendor. {TAX_NOTE} Rinciannya ada di tiap versi penawaran.</p></details></div>
          <div className="bg-sum">
            <div className="bg-sumrow bg-sumhead" aria-hidden="true"><span>Lingkup</span><span>Budget (Rp)</span><span>Dipilih (Rp)</span><span title="Budget dikurangi nilai dipilih. Negatif (merah) = melebihi budget.">Sisa (Rp)</span><span>Dibayar (Rp)</span><span /></div>
            {rows.map((r) => {
              const none = r.state === "none" && r.drives === 0;
              const showCat = categoryLabel(r.category).toLowerCase() !== r.name.trim().toLowerCase();
              const sep = <span aria-hidden> · </span>;
              const parts = [r.vendor ? <span key="v">{r.vendor}</span> : null, none ? <span key="s" className="muted">Belum dipilih</span> : r.state === "none" ? <span key="s" className="tag">belanja drive</span> : <span key="s">{stage(r)}</span>, showCat ? <span key="c">{categoryLabel(r.category)}</span> : null].filter(Boolean);
              return (
                <Link key={r.id} href={`/admin/p/${slug}/budget/scope/${r.id}`} className="row-btn bg-sumrow">
                  <span className="min-w-0">
                    <span className="block font-semibold">{r.name}</span>
                    <span className="text-ink-2 block text-[12px]">{parts.map((x, i) => <span key={i}>{i > 0 && sep}{x}</span>)}</span>
                  </span>
                  <span className="bg-cell"><span className="bg-lab">Budget</span><span className="bg-num block">{fmt(r.budget)}</span></span>
                  <span className="bg-cell"><span className="bg-lab">Dipilih</span><span className="bg-num block">{none ? <span className="muted">—</span> : fmt(r.chosen)}</span></span>
                  <span className="bg-cell"><span className="bg-lab">Sisa</span>
                    <span className={`bg-num block ${none ? "muted" : r.variance < 0 || r.overpaid > 0 ? "text-danger" : ""}`}>{none ? "—" : fmt(r.variance)}</span>
                    {!none && r.budget > 0 && r.chosen > 0 && <span className="bg-meter is-block" aria-hidden="true"><i style={{ inlineSize: `${Math.min(r.chosen / r.budget, 1) * 100}%`, background: r.chosen > r.budget ? "var(--danger)" : "var(--ok)" }} /></span>}
                  </span>
                  <span className="bg-cell"><span className="bg-lab">Dibayar</span>
                    <span className={`bg-num block ${r.overpaid > 0 ? "text-danger" : ""}`}>{money(r.paid)}</span>
                    <span className={`bg-num text-ink-2 block text-[12px] ${r.overInvoiced > 0 ? "text-danger" : ""}`}>{r.invoiced > 0 ? `dari ${fmt(r.invoiced)}` : "belum ditagih"}</span>
                  </span>
                  <span className="bg-chev" aria-hidden="true"><Icon name="chevron" /></span>
                </Link>
              );
            })}
            <div className="bg-sumrow bg-sumtotal font-medium">
              <span>Total</span>
              <span className="bg-cell"><span className="bg-lab">Budget</span><span className="bg-num block">{fmt(total.budget)}</span></span>
              <span className="bg-cell"><span className="bg-lab">Dipilih</span><span className="bg-num block">{money(total.chosen)}{total.provisional && <> <span className="tag tag-warn">perkiraan</span></>}</span></span>
              <span className="bg-cell"><span className="bg-lab">Sisa</span><span className={`bg-num block ${totalVar < 0 ? "text-danger" : ""}`} title="Hanya lingkup yang sudah dipilih">{total.chosen === 0 ? dash : fmt(totalVar)}</span></span>
              <span className="bg-cell"><span className="bg-lab">Dibayar</span><span className={`bg-num block ${total.overpaid > 0 ? "text-danger" : ""}`}>{money(total.paid)}</span><span className="bg-num text-ink-2 block text-[12px] font-normal">{total.invoiced > 0 ? `dari ${fmt(total.invoiced)}` : ""}</span></span>
              <span />
            </div>
          </div>
        </>
      ))}
      {tab === "bills" && <InvoiceList slug={slug} invoices={invoices} today={today} />}
      {tab === "drive" && <DriveTab key={`${drive.scenarioId}${drive.seeded}${JSON.stringify(drive.calc)}${drive.rates.length}`} slug={slug} canEdit={canEdit} {...drive} />}
      {tab === "plans" && <ScenarioTab slug={slug} canEdit={canEdit} {...plans} />}
      {tab === "vendor" && <VendorPanel slug={slug} canEdit={canEdit} vendors={vendors} contacts={contacts} scopes={rows.map((r) => ({ id: r.id, name: r.name }))} summaryHref={tabHref("sum")} />}
      {adding && <ScopeDrawer slug={slug} init={{ id: null, name: "", category: "other", budget: 0, phaseIds: [], deliverableIds: [], notes: "" }} phases={phases} deliverables={deliverables} onClose={() => setAdding(false)} />}
    </section>
  );
}
