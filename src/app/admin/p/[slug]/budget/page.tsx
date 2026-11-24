import { notFound } from "next/navigation";
import { BudgetView } from "@/components/budget/BudgetView";
import { can } from "@/lib/auth/permissions";
import { invoiceRow, jakartaToday } from "@/lib/budget/invoice-view";
import { rollup } from "@/lib/budget/rollup";
import { getBudget } from "@/lib/budget/service";
import { listDeliverables } from "@/lib/deliverables/service";
import { loadProject } from "@/lib/project-context";
import { listPhases } from "@/lib/script/service";
import { getTeam } from "@/lib/services";

export default async function BudgetPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const { db, project, role, user } = await loadProject(slug);
  if (!can(role, "budget.view")) notFound();
  const data = await getBudget(db, user.id, project.id);
  const { rows, total } = rollup(data);
  const [phases, deliverables, team] = await Promise.all([listPhases(db, project.id), listDeliverables(db, project.id, { includeInternal: true }), getTeam(db, project.id, { includeInternal: true })]);
  return (
    <div className="mx-auto max-w-[1100px] space-y-4">
      <div>
        <h1 className="page-title">Anggaran & vendor</h1>
        <p className="page-meta">Budget per lingkup, penawaran vendor, dan versinya. Angka sebelum pajak.</p>
      </div>
      <BudgetView
        slug={slug}
        canEdit={can(role, "budget.edit")}
        rows={rows.map((r) => { const s = data.scopes.find((x) => x.id === r.scopeId)!; return { id: s.id, name: s.name, category: s.category, budget: r.budget, chosen: r.chosen, invoiced: r.invoiced, paid: r.paid, overInvoiced: r.overInvoiced, overpaid: r.overpaid, state: r.state, variance: r.variance, cancelled: r.cancelled, vendor: (() => { const pk = data.picks.find((x) => x.scopeId === s.id); const bid = pk && data.bids.find((x) => x.id === pk.bidId); return bid ? data.vendors.find((v) => v.id === bid.vendorId)?.name ?? null : null; })() }; })}
        total={{ budget: total.budget, chosen: total.chosen, invoiced: total.invoiced, paid: total.paid, overpaid: total.overpaid, provisional: total.provisional }}
        today={jakartaToday()}
        invoices={data.invoices.map((i) => {
          const sc = data.scopes.find((x) => x.id === i.scopeId);
          const chosenBid = data.picks.find((x) => x.scopeId === i.scopeId)?.bidId;
          const bid = data.bids.find((x) => x.id === chosenBid);
          return invoiceRow(i, data.payments, sc?.name ?? "—", data.vendors.find((v) => v.id === i.vendorId)?.name ?? "—", bid?.vendorId === i.vendorId);
        })}
        phases={phases.map((p) => ({ id: p.id, name: `${p.name} (${p.track})` }))}
        deliverables={deliverables.map((d) => ({ id: d.id, name: d.name }))}
        vendors={data.vendors.map((v) => ({ id: v.id, name: v.name, categories: v.categories, contactName: v.contactName, email: v.email, phone: v.phone, teamContactId: v.teamContactId, chargesPpn: v.chargesPpn, withholdsPph23: v.withholdsPph23, notes: v.notes, archived: !!v.archivedAt }))}
        contacts={team.flatMap((g) => g.contacts).map((c) => ({ id: c.id, name: c.name }))}
      />
    </div>
  );
}
