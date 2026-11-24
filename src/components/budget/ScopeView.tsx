"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { addScopeBid, chooseBid, removeBid, removeScope } from "@/app/admin/budget-actions";
import { ConfirmButton } from "@/components/ui/controls";
import { useToast } from "@/components/ui/toast";
import { VERSION_STATUSES, type VersionStatusCode } from "@/lib/budget/catalog";
import { formatRupiah } from "@/lib/budget/money";
import { ScopeDrawer, type Option, type ScopeForm } from "./BudgetView";
import { StatusSelect } from "./StatusSelect";
import { VersionDrawer, type PrefillLine } from "./VersionDrawer";

export type VersionRow = { id: string; number: number; ref: string; docDate: string | null; status: VersionStatusCode; subtotal: number; ppn: number; pph23: number; ppnRateBp: number | null; pph23RateBp: number | null; notes: string; links: string[]; authorName: string; lines: PrefillLine[] };
export type BidView = { id: string; vendor: string; docId: string; picked: boolean; versions: VersionRow[] };

export function ScopeView({ slug, canEdit, scope, bids, addable, phases, deliverables }: { slug: string; canEdit: boolean; scope: ScopeForm; bids: BidView[]; addable: Option[]; phases: Option[]; deliverables: Option[] }) {
  const toast = useToast();
  const router = useRouter();
  const [editing, setEditing] = useState(false);
  const [adding, setAdding] = useState<{ bid: BidView } | null>(null);
  const [vendorId, setVendorId] = useState("");
  const act = async (p: Promise<{ ok: boolean; error?: string }>, done: string, then?: () => void) => {
    const r = await p;
    toast(r.ok ? { message: done } : { message: r.error ?? "Gagal.", tone: "error" });
    if (r.ok) { then?.(); router.refresh(); }
  };
  return (
    <div className="space-y-6">
      {canEdit && (
        <div className="flex flex-wrap items-center gap-2">
          <button type="button" className="btn-secondary" onClick={() => setEditing(true)}>Ubah lingkup</button>
          <form action={async () => act(removeScope(slug, scope.id!), "Lingkup dihapus.", () => router.push(`/admin/p/${slug}/budget`))}>
            <ConfirmButton className="btn-ghost" message={`Hapus lingkup "${scope.name}" beserta semua penawaran dan versinya? Tidak bisa dibatalkan.`}>Hapus lingkup</ConfirmButton>
          </form>
        </div>
      )}
      {canEdit && addable.length > 0 && (
        <div className="flex flex-wrap items-center gap-2">
          <select aria-label="Vendor" value={vendorId} onChange={(e) => setVendorId(e.target.value)}><option value="">Pilih vendor…</option>{addable.map((v) => <option key={v.id} value={v.id}>{v.name}</option>)}</select>
          <button type="button" className="btn-secondary" disabled={!vendorId} onClick={() => act(addScopeBid(slug, scope.id!, vendorId), "Vendor ditambahkan.", () => setVendorId(""))}>Tambah vendor ke lingkup</button>
        </div>
      )}
      {bids.length === 0 && <p className="muted text-sm">Belum ada vendor di lingkup ini.</p>}
      {bids.map((b) => {
        const latest = b.versions[b.versions.length - 1];
        return (
          <section key={b.id} className="bg-bid space-y-3">
            <div className="flex flex-wrap items-center gap-2">
              <h2 className="section-band">{b.vendor}</h2>
              {b.picked && <span className="tag tag-ok">Dipilih</span>}
              <span className="grow" />
              {canEdit && (
                <>
                  {!b.picked && <button type="button" className="btn-secondary" onClick={() => act(chooseBid(slug, scope.id!, b.id), "Vendor dipilih.")}>Pilih vendor ini</button>}
                  <button type="button" className="btn" onClick={() => setAdding({ bid: b })}>Versi baru</button>
                  <form action={async () => act(removeBid(slug, b.id), "Vendor dihapus dari lingkup.")}><ConfirmButton className="btn-ghost" message={`Hapus ${b.vendor} dari lingkup ini beserta semua versinya?`}>Hapus</ConfirmButton></form>
                </>
              )}
            </div>
            {b.versions.length === 0 ? <p className="muted text-sm">Belum ada versi penawaran.</p> : (
              <div className="overflow-x-auto">
                <table className="table w-full text-sm">
                  <thead><tr><th className="text-start">No</th><th className="text-start">Tanggal</th><th className="text-start">Status</th><th className="bg-num">Subtotal</th><th className="bg-num">PPN (perkiraan)</th><th className="bg-num">PPh 23 (perkiraan)</th><th className="bg-num">Net</th><th className="text-start">Catatan</th><th className="text-start">Links</th></tr></thead>
                  <tbody>
                    {b.versions.map((v) => (
                      <tr key={v.id}>
                        <td className="tabular-nums">v{v.number}{v.ref && <span className="muted"> {v.ref}</span>}</td>
                        <td className="tabular-nums">{v.docDate ?? "—"}</td>
                        <td>{canEdit ? <StatusSelect slug={slug} versionId={v.id} status={v.status} /> : <span className={`tag ${v.status === "approved" ? "tag-ok" : v.status === "rejected" ? "tag-danger" : ""}`}>{VERSION_STATUSES[v.status]}</span>}</td>
                        <td className="bg-num">{formatRupiah(v.subtotal)}</td>
                        <td className="bg-num">{formatRupiah(v.ppn)}</td>
                        <td className="bg-num">{formatRupiah(v.pph23)}</td>
                        <td className="bg-num">{formatRupiah(v.subtotal + v.ppn - v.pph23)}</td>
                        <td>{v.notes}</td>
                        <td>{v.links.map((l, i) => <a key={l} href={l} target="_blank" rel="noreferrer noopener" className="me-2 underline">Link {i + 1}</a>)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
            {adding?.bid.id === b.id && (
              <VersionDrawer key={b.id} slug={slug} docId={b.docId} vendor={b.vendor} prefill={latest?.lines ?? []} ppnBp={latest?.ppnRateBp ?? null} pph23Bp={latest?.pph23RateBp ?? null} first={!latest} onClose={() => setAdding(null)} />
            )}
          </section>
        );
      })}
      {editing && <ScopeDrawer slug={slug} init={scope} phases={phases} deliverables={deliverables} onClose={() => setEditing(false)} />}
    </div>
  );
}
