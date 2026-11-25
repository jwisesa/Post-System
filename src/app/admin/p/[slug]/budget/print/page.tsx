import { notFound } from "next/navigation";
import { PrintActions } from "@/components/timeline/PrintActions";
import { can } from "@/lib/auth/permissions";
import { categoryLabel, TAX_NOTE } from "@/lib/budget/catalog";
import { formatRupiah } from "@/lib/budget/money";
import { invoiceState, rollup } from "@/lib/budget/rollup";
import { buildComparison } from "@/lib/budget/scenarios";
import { getBudget } from "@/lib/budget/service";
import { loadProject } from "@/lib/project-context";
import { fmtDate, today } from "@/lib/schedule/dates";

const VIEWS = { ringkasan: "Ringkasan anggaran", tagihan: "Tagihan", rencana: "Perbandingan rencana" } as const;
const INV = { planned: "Rencana", received: "Diterima", cancelled: "Dibatalkan" } as const;
const th = "py-1 pe-3 text-left font-normal";
const thn = "py-1 ps-3 text-right font-normal";
const td = "py-1 pe-3 align-top";
const tdn = "py-1 ps-3 text-right align-top";
const rp = formatRupiah;

export default async function PrintBudget({ params, searchParams }: { params: Promise<{ slug: string }>; searchParams: Promise<{ view?: string }> }) {
  const { slug } = await params;
  const q = await searchParams;
  const { db, project, role, user } = await loadProject(slug);
  if (!can(role, "budget.view")) notFound();
  const view = (q.view && q.view in VIEWS ? q.view : "ringkasan") as keyof typeof VIEWS;
  const data = await getBudget(db, user.id, project.id);
  const { rows, total } = rollup(data);
  const scope = (id: string) => data.scopes.find((s) => s.id === id);
  const vendor = (id: string) => data.vendors.find((v) => v.id === id)?.name ?? "—";
  const cmp = view === "rencana" ? buildComparison(data, data.scenarios.map((s) => s.id)) : null;
  return (
    <>
      <style>{`@page { size: A4 landscape; margin: 12mm; } .print-sheet tr { break-inside: avoid; } .print-sheet thead { display: table-header-group; } @media print { body * { print-color-adjust: exact; -webkit-print-color-adjust: exact; } }`}</style>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="space-y-1">
          <h1>{project.name}</h1>
          <p className="text-sm">{VIEWS[view]}{view !== "rencana" && data.scenarioName ? ` · Rencana: ${data.scenarioName}` : ""}</p>
          <p className="muted text-sm">Dicetak {fmtDate(today())}</p>
        </div>
        <PrintActions backHref={`/admin/p/${slug}/budget`} backLabel="Kembali ke anggaran" />
      </div>
      <p className="mt-3 text-sm">Semua angka sebelum pajak (DPP), Rupiah. Dipilih = penawaran + tambahan pekerjaan disetujui.</p>
      <table className="print-sheet mt-3 w-full text-sm tabular-nums">
        {view === "ringkasan" && (
          <>
            <thead className="border-b border-line"><tr className="muted"><th className={th}>Lingkup</th><th className={th}>Vendor terpilih</th><th className={thn}>Budget</th><th className={thn}>Dipilih</th><th className={thn}>Ditagih</th><th className={thn}>Dibayar</th><th className={thn}>Selisih</th></tr></thead>
            <tbody className="divide-y divide-line">
              {rows.map((r) => {
                const s = scope(r.scopeId)!;
                const bid = data.bids.find((b) => b.id === data.picks.find((p) => p.scopeId === s.id)?.bidId);
                return <tr key={s.id}><td className={`${td} font-medium`}>{s.name} <span className="muted">{categoryLabel(s.category)}</span></td><td className={td}>{bid ? vendor(bid.vendorId) : "—"}</td><td className={tdn}>{rp(r.budget)}</td><td className={tdn}>{rp(r.chosen)}{r.state === "provisional" ? " (perkiraan)" : ""}</td><td className={tdn}>{rp(r.invoiced)}</td><td className={tdn}>{rp(r.paid)}</td><td className={tdn}>{rp(r.variance)}</td></tr>;
              })}
            </tbody>
            <tfoot className="border-t border-line font-medium"><tr><td className={td}>Total</td><td /><td className={tdn}>{rp(total.budget)}</td><td className={tdn}>{rp(total.chosen)}</td><td className={tdn}>{rp(total.invoiced)}</td><td className={tdn}>{rp(total.paid)}</td><td className={tdn}>{rp(total.budget - total.chosen)}</td></tr></tfoot>
          </>
        )}
        {view === "tagihan" && (
          <>
            <thead className="border-b border-line"><tr className="muted"><th className={th}>Lingkup</th><th className={th}>Vendor</th><th className={th}>Termin</th><th className={th}>No.</th><th className={th}>Jatuh tempo</th><th className={thn}>Subtotal</th><th className={thn}>PPN (perk.)</th><th className={thn}>PPh 23 (perk.)</th><th className={thn}>Net</th><th className={thn}>Dibayar</th><th className={thn}>Sisa</th><th className={th}>Status</th></tr></thead>
            <tbody className="divide-y divide-line">
              {data.invoices.map((i) => {
                const st = invoiceState(i, data.payments.filter((p) => p.invoiceId === i.id));
                return <tr key={i.id}><td className={td}>{scope(i.scopeId)?.name ?? "—"}</td><td className={td}>{vendor(i.vendorId)}</td><td className={td}>{i.termin}</td><td className={td}>{i.ref}</td><td className={`${td} whitespace-nowrap`}>{i.dueDate ? fmtDate(i.dueDate) : "—"}</td><td className={tdn}>{rp(i.subtotal)}</td><td className={tdn}>{rp(i.ppn)}</td><td className={tdn}>{rp(i.pph23)}</td><td className={tdn}>{rp(st.net)}</td><td className={tdn}>{rp(st.cash)}</td><td className={tdn}>{rp(st.remaining)}</td><td className={`${td} ps-3`}>{INV[i.status]}</td></tr>;
              })}
            </tbody>
          </>
        )}
        {view === "rencana" && cmp && (
          <>
            <thead className="border-b border-line"><tr className="muted"><th className={th}>Lingkup</th><th className={thn}>Budget</th>{cmp.scenarios.map((s) => <th key={s.id} className={thn}>{s.name}{s.isActive ? " (aktif)" : ""}</th>)}</tr></thead>
            <tbody className="divide-y divide-line">
              {cmp.scopes.map((s) => <tr key={s.id}><td className={`${td} font-medium`}>{s.name}</td><td className={tdn}>{rp(s.budget)}</td>{cmp.scenarios.map((v) => <td key={v.id} className={tdn}>{v.cells[s.id]?.vendor ?? "—"}<br />{rp(v.cells[s.id]?.amount ?? 0)}</td>)}</tr>)}
              <tr><td className={td}>Hard drive</td><td />{cmp.scenarios.map((v) => <td key={v.id} className={tdn}>{rp(v.drives)}</td>)}</tr>
            </tbody>
            <tfoot className="border-t border-line font-medium"><tr><td className={td}>Total dipilih</td><td className={tdn}>{rp(cmp.scenarios[0]?.total.budget ?? 0)}</td>{cmp.scenarios.map((v) => <td key={v.id} className={tdn}>{rp(v.total.chosen)}</td>)}</tr></tfoot>
          </>
        )}
      </table>
      <p className="muted mt-4 text-xs">{TAX_NOTE}</p>
    </>
  );
}
