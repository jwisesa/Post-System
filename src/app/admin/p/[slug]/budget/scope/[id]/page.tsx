import Link from "next/link";
import { notFound } from "next/navigation";
import { ScopeView } from "@/components/budget/ScopeView";
import { can } from "@/lib/auth/permissions";
import { categoryLabel } from "@/lib/budget/catalog";
import { formatRupiah } from "@/lib/budget/money";
import { getScope } from "@/lib/budget/service";
import { listDeliverables } from "@/lib/deliverables/service";
import { loadProject } from "@/lib/project-context";
import { listPhases } from "@/lib/script/service";

export default async function ScopePage({ params }: { params: Promise<{ slug: string; id: string }> }) {
  const { slug, id } = await params;
  const { db, project, role, user } = await loadProject(slug);
  if (!can(role, "budget.view")) notFound();
  const d = await getScope(db, user.id, project.id, id);
  if (!d) notFound();
  const [phases, deliverables] = await Promise.all([listPhases(db, project.id), listDeliverables(db, project.id, { includeInternal: true })]);
  const pick = d.picks[0];
  const bids = d.bids.map((b) => {
    const doc = d.docs.find((x) => x.bidId === b.id && x.kind === "quote")!;
    return {
      id: b.id, vendor: d.vendors.find((v) => v.id === b.vendorId)?.name ?? "—", docId: doc.id, picked: pick?.bidId === b.id,
      versions: d.versions.filter((v) => v.docId === doc.id).map((v) => ({ id: v.id, number: v.number, ref: v.ref, docDate: v.docDate, status: v.status, subtotal: v.subtotal, ppn: v.ppn, pph23: v.pph23, ppnRateBp: v.ppnRateBp, pph23RateBp: v.pph23RateBp, notes: v.notes, links: v.links, authorName: v.authorName, lines: v.lines.map((l) => ({ key: l.key, item: l.item, qtyMilli: l.qtyMilli, unit: l.unit, unitPrice: l.unitPrice })) })),
    };
  });
  const taken = new Set(d.bids.map((b) => b.vendorId));
  return (
    <div className="mx-auto max-w-[1100px] space-y-5">
      <div>
        <p className="page-meta"><Link href={`/admin/p/${slug}/budget`}>Anggaran & vendor</Link></p>
        <h1 className="page-title">{d.scope.name}</h1>
        <p className="page-meta">{categoryLabel(d.scope.category)} · Target <span className="tabular-nums">{formatRupiah(d.scope.budget)}</span> sebelum pajak</p>
        <p className="page-meta">Fase: {d.phases.map((p) => p.name).join(", ") || "—"} · Deliverable: {d.deliverables.map((x) => x.name).join(", ") || "—"}</p>
      </div>
      <ScopeView
        slug={slug}
        canEdit={can(role, "budget.edit")}
        scope={{ id: d.scope.id, name: d.scope.name, category: d.scope.category, budget: d.scope.budget, phaseIds: d.scope.phaseIds, deliverableIds: d.scope.deliverableIds, notes: d.scope.notes }}
        bids={bids}
        addable={d.vendors.filter((v) => !v.archivedAt && !taken.has(v.id)).map((v) => ({ id: v.id, name: v.name }))}
        phases={phases.map((p) => ({ id: p.id, name: `${p.name} (${p.track})` }))}
        deliverables={deliverables.map((x) => ({ id: x.id, name: x.name }))}
      />
    </div>
  );
}
