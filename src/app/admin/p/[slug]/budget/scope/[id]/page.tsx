import Link from "next/link";
import { notFound } from "next/navigation";
import { Section } from "@/components/ui/section";
import { ScopeView } from "@/components/budget/ScopeView";
import { can } from "@/lib/auth/permissions";
import { categoryLabel, DEFAULT_PPH23_BP, DEFAULT_PPN_BP, TAX_NOTE } from "@/lib/budget/catalog";
import { invoiceRow, jakartaToday } from "@/lib/budget/invoice-view";
import { formatRupiah } from "@/lib/budget/money";
import { bidValue, scopeNumbers } from "@/lib/budget/rollup";
import { compareBids } from "@/lib/budget/vendors";
import { getScope, getScopeHistory } from "@/lib/budget/service";
import { listDeliverables } from "@/lib/deliverables/service";
import { loadProject } from "@/lib/project-context";
import { listPhases } from "@/lib/script/service";

const stamp = new Intl.DateTimeFormat("id-ID", { dateStyle: "medium", timeStyle: "short", timeZone: "Asia/Jakarta" });

export default async function ScopePage({ params }: { params: Promise<{ slug: string; id: string }> }) {
  const { slug, id } = await params;
  const { db, project, role, user } = await loadProject(slug);
  if (!can(role, "budget.view")) notFound();
  const d = await getScope(db, user.id, project.id, id);
  if (!d) notFound();
  const history = await getScopeHistory(db, user.id, project.id, id);
  const [phases, deliverables] = await Promise.all([listPhases(db, project.id), listDeliverables(db, project.id, { includeInternal: true })]);
  const pick = d.picks[0];
  const today = jakartaToday();
  const vrows = (docId: string) => d.versions.filter((v) => v.docId === docId).map((v) => ({ id: v.id, number: v.number, ref: v.ref, docDate: v.docDate, status: v.status, subtotal: v.subtotal, ppn: v.ppn, pph23: v.pph23, ppnRateBp: v.ppnRateBp, pph23RateBp: v.pph23RateBp, notes: v.notes, statusNote: v.statusNote, links: v.links, authorName: v.authorName, pricing: v.pricing, corrected: !!v.correctsVersionId, lines: v.lines.map((l) => ({ key: l.key, item: l.item, qtyMilli: l.qtyMilli, unit: l.unit, unitPrice: l.unitPrice })) }));
  const bids = d.bids.map((b) => {
    const doc = d.docs.find((x) => x.bidId === b.id && x.kind === "quote")!;
    const vendor = d.vendors.find((v) => v.id === b.vendorId);
    const mine = d.docs.filter((x) => x.bidId === b.id);
    return {
      id: b.id, vendor: vendor?.name ?? "—", vendorId: b.vendorId, docId: doc.id, picked: pick?.bidId === b.id,
      versions: vrows(doc.id),
      changeOrders: mine.filter((x) => x.kind === "change_order").map((x) => ({ docId: x.id, title: x.title, versions: vrows(x.id) })),
      invoices: d.invoices.filter((i) => i.vendorId === b.vendorId).map((i) => invoiceRow(i, d.payments, d.scope.name, vendor?.name ?? "—", pick?.bidId === b.id)),
      docs: mine.map((x) => ({ id: x.id, label: x.kind === "quote" ? "Penawaran" : `Tambahan: ${x.title}` })),
      ppnBp: vendor?.chargesPpn === false ? null : DEFAULT_PPN_BP, pph23Bp: vendor?.withholdsPph23 === false ? null : DEFAULT_PPH23_BP,
    };
  });
  const names = new Map(d.bids.map((b) => [b.id, d.vendors.find((v) => v.id === b.vendorId)?.name ?? "—"]));
  const cmp = compareBids(d.scope.id, { scopes: [{ id: d.scope.id, budget: d.scope.budget }], bids: d.bids, docs: d.docs, versions: d.versions, picks: d.picks, invoices: d.invoices, payments: d.payments }, names);
  const rows = { scopes: [{ id: d.scope.id, budget: d.scope.budget }], bids: d.bids, docs: d.docs, versions: d.versions, picks: d.picks, invoices: d.invoices, payments: d.payments };
  const sn = scopeNumbers(d.scope.id, rows);
  const pbv = pick ? bidValue(pick.bidId, rows, pick.versionId) : null;
  const pv = pbv?.versionId ? d.versions.find((v) => v.id === pbv.versionId) : null;
  const taken = new Set(d.bids.map((b) => b.vendorId));
  const stageLabel = pick ? (pbv?.state === "approved" ? "Disetujui" : "Masuk budget") : null;
  const over = sn.chosen > sn.budget;
  const anyVersion = d.versions.length > 0;
  const last = history[0]?.entry.createdAt;
  const lab = <T extends string>(t: T) => <p className="bg-lab">{t}</p>;
  return (
    <div className="page space-y-5">
      <ScopeView
        slug={slug}
        canEdit={can(role, "budget.edit")}
        today={today}
        scope={{ id: d.scope.id, name: d.scope.name, category: d.scope.category, budget: d.scope.budget, phaseIds: d.scope.phaseIds, deliverableIds: d.scope.deliverableIds, notes: d.scope.notes }}
        meta={<>
          {categoryLabel(d.scope.category)} · Fase: {d.phases.length ? d.phases.map((p, i) => <span key={p.id}>{i > 0 && ", "}<Link href={`/admin/p/${slug}/timeline?item=${p.id}`} className="underline">{p.name}</Link></span>) : "—"} · Deliverable: {d.deliverables.map((x) => x.name).join(", ") || "—"}
          {d.scenarioName && <> · <Link href={`/admin/p/${slug}/budget?tab=rencana`} className="tag">Rencana: {d.scenarioName}</Link></>}
        </>}
        top={<>
          <div className="bg-kpi">
            <div>{lab("Budget")}<p className="bg-big">{formatRupiah(sn.budget)}</p></div>
            <div>{lab("Dipilih")}<p className="bg-big">{pick ? formatRupiah(sn.chosen) : <span className="muted">—</span>}</p>
              <p className="text-ink-2 text-[12px]">{pick && pbv ? <>{names.get(pick.bidId)}{pv && ` v${pv.number}`} · <span className={`tag ${pbv.state === "approved" ? "tag-ok" : pbv.state === "provisional" ? "tag-warn" : ""}`}>{stageLabel}{pbv.state === "provisional" ? " · perkiraan" : ""}</span></> : "Belum ada vendor di budget"}</p></div>
            <div>{lab("Sisa")}<p className={`bg-big ${pick && sn.variance < 0 ? "text-danger" : ""}`}>{pick ? formatRupiah(sn.variance) : <span className="muted">—</span>}</p>
              {pick && sn.budget > 0 && sn.chosen > 0 && <span className="bg-meter is-block" aria-hidden="true"><i style={{ inlineSize: `${Math.min(sn.chosen / sn.budget, 1) * 100}%`, background: over ? "var(--danger)" : "var(--ok)" }} /></span>}</div>
            <div>{lab("Dibayar / ditagih")}<p className="bg-big">{formatRupiah(sn.paid)}</p><p className="text-ink-2 text-[12px]">dari {formatRupiah(sn.invoiced)} ditagih</p></div>
          </div>
          {anyVersion && <details className="muted mt-2 text-xs"><summary className="cursor-pointer">Soal pajak</summary><p className="mt-1">{TAX_NOTE}</p></details>}
        </>}
        bids={bids}
        cmp={cmp}
        addable={d.vendors.filter((v) => !v.archivedAt && !taken.has(v.id)).map((v) => ({ id: v.id, name: v.name }))}
        phases={phases.map((p) => ({ id: p.id, name: `${p.name} (${p.track})` }))}
        deliverables={deliverables.map((x) => ({ id: x.id, name: x.name }))}
        seeds={d.deliverables.map((x) => ({ id: x.id, name: x.name }))}
      >
        <Section id="riwayat" title="Riwayat" defaultOpen={false} digest={history.length ? <span>{history.length} perubahan · terakhir {last ? new Intl.DateTimeFormat("id-ID", { dateStyle: "medium", timeZone: "Asia/Jakarta" }).format(last) : "—"}</span> : undefined}>
          {history.length === 0 ? <p className="muted text-sm">Belum ada riwayat.</p> : (
            <ul className="rows">
              {history.map(({ entry, userName }) => (
                <li key={entry.id} className="min-w-0 break-words py-2 text-[13px]">
                  <span className="font-semibold">{userName ?? "—"}</span> <span className="text-ink-2">· {stamp.format(entry.createdAt)} ·</span> {entry.summary}
                  {(entry.before != null || entry.after != null) && (
                    <details className="bg-hist-detail mt-1">
                      <summary className="muted cursor-pointer">Detail</summary>
                      {entry.before != null && <><p className="muted">Sebelum</p><pre>{JSON.stringify(entry.before, null, 2)}</pre></>}
                      {entry.after != null && <><p className="muted">Sesudah</p><pre>{JSON.stringify(entry.after, null, 2)}</pre></>}
                    </details>
                  )}
                </li>
              ))}
            </ul>
          )}
        </Section>
      </ScopeView>
    </div>
  );
}
