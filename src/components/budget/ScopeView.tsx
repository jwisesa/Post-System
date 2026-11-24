"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { addScopeBid, chooseBid, removeBid, removeScope } from "@/app/admin/budget-actions";
import { ConfirmButton } from "@/components/ui/controls";
import { useToast } from "@/components/ui/toast";
import { CANCEL_MARK, VERSION_STATUSES, type VersionStatusCode } from "@/lib/budget/catalog";
import { formatRupiah } from "@/lib/budget/money";
import type { VendorCmp } from "@/lib/budget/vendors";
import { ScopeDrawer, type Option, type ScopeForm } from "./BudgetView";
import { StatusSelect } from "./StatusSelect";
import { VersionDrawer, type PrefillLine } from "./VersionDrawer";

export type VersionRow = { id: string; number: number; ref: string; docDate: string | null; status: VersionStatusCode; subtotal: number; ppn: number; pph23: number; ppnRateBp: number | null; pph23RateBp: number | null; notes: string; statusNote: string; links: string[]; authorName: string; lines: PrefillLine[] };
export type BidView = { id: string; vendor: string; docId: string; picked: boolean; versions: VersionRow[] };

export function ScopeView({ slug, canEdit, scope, bids, addable, phases, deliverables, cmp }: { slug: string; canEdit: boolean; cmp: VendorCmp[]; scope: ScopeForm; bids: BidView[]; addable: Option[]; phases: Option[]; deliverables: Option[] }) {
  const toast = useToast();
  const router = useRouter();
  const [editing, setEditing] = useState(false);
  const [adding, setAdding] = useState<{ bid: BidView } | null>(null);
  const [vendorId, setVendorId] = useState("");
  const [sel, setSel] = useState<string[]>([]);
  const latestOf = (id: string) => cmp.find((c) => c.bidId === id)?.latestVersionId;
  const pair = sel.map(latestOf).filter(Boolean);
  const base = `/admin/p/${slug}/budget/compare`;
  const STATE = (c: VendorCmp) => c.state === "none" ? <span className="muted">Belum ada penawaran</span> : c.state === "provisional" ? <><span className="tag tag-warn">perkiraan</span>{c.cancelled && <span className="tag tag-warn">persetujuan dibatalkan</span>}</> : c.state === "pinned" ? <span className="tag tag-ok">Terpilih</span> : <span className="tag tag-ok">Disetujui</span>;
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
      {cmp.length > 0 && (
        <section className="space-y-2">
          <h2 className="text-sm font-semibold">Perbandingan vendor</h2>
          <div className="overflow-x-auto">
            <table className="table w-full text-sm">
              <thead><tr><th /><th className="text-start">Vendor</th><th className="bg-num">Nilai (sebelum pajak)</th><th className="text-start">Status nilai</th><th className="bg-num">Selisih vs budget</th><th className="bg-num">Vs termurah</th><th className="bg-num">Versi</th><th className="text-start">Status terakhir</th><th /></tr></thead>
              <tbody>
                {cmp.map((c) => (
                  <tr key={c.bidId}>
                    <td><input type="checkbox" aria-label={`Pilih ${c.vendor} untuk dibandingkan`} disabled={!c.latestVersionId || (!sel.includes(c.bidId) && sel.length >= 2)} checked={sel.includes(c.bidId)} onChange={(e) => setSel(e.target.checked ? [...sel, c.bidId] : sel.filter((x) => x !== c.bidId))} /></td>
                    <td className="font-medium">{c.vendor} {c.chosen ? <span className="tag tag-ok">Dipilih</span> : <span className="tag">Alternatif</span>}</td>
                    <td className="bg-num">{c.state === "none" ? "—" : formatRupiah(c.value)}</td>
                    <td>{STATE(c)}</td>
                    <td className={`bg-num ${c.vsBudget != null && c.vsBudget < 0 ? "text-danger" : ""}`}>{c.vsBudget == null ? "—" : formatRupiah(c.vsBudget)}</td>
                    <td className="bg-num">{c.vsCheapest == null ? "—" : c.cheapest ? <span className="tag tag-ok">Termurah</span> : `+${formatRupiah(c.vsCheapest)}`}</td>
                    <td className="bg-num">{c.versions}</td>
                    <td>{c.lastStatus ? VERSION_STATUSES[c.lastStatus as VersionStatusCode] : "—"}</td>
                    <td>{canEdit && !c.chosen && <button type="button" className="btn-secondary" onClick={() => act(chooseBid(slug, scope.id!, c.bidId), "Vendor dipilih.")}>Pilih vendor ini</button>}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {pair.length === 2 ? <Link className="btn-secondary" href={`${base}?a=${pair[0]}&b=${pair[1]}`}>Bandingkan versi terbaru kedua vendor</Link> : <p className="muted text-xs">Centang dua vendor untuk membandingkan versi terbarunya. Nilai = penawaran + change order disetujui; semua sebelum pajak (DPP).</p>}
        </section>
      )}
      {bids.length === 0 && <p className="muted text-sm">Belum ada vendor di lingkup ini.</p>}
      {bids.map((b) => {
        const latest = b.versions[b.versions.length - 1];
        return (
          <section key={b.id} className="bg-bid space-y-3">
            <div className="bg-vhead">
              <h2>{b.vendor}</h2>
              {b.picked ? <span className="tag tag-ok">Dipilih</span> : <span className="tag">Alternatif</span>}
              {latest && <span className="muted text-sm">v{latest.number} · {VERSION_STATUSES[latest.status]}</span>}
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
                  <thead><tr><th className="text-start">No</th><th className="text-start">Tanggal</th><th className="text-start">Status</th><th className="bg-num">Subtotal</th><th className="bg-num">PPN (perkiraan)</th><th className="bg-num">PPh 23 (perkiraan)</th><th className="bg-num">Net</th><th className="text-start">Catatan</th><th className="text-start">Links</th><th /></tr></thead>
                  <tbody>
                    {b.versions.map((v, i) => (
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
                        <td className="whitespace-nowrap text-sm">
                          {v.status === "negotiating" && v.statusNote.startsWith(CANCEL_MARK) && <span className="tag tag-warn">persetujuan dibatalkan</span>}
                          {i > 0 && <Link href={`${base}?a=${b.versions[i - 1].id}&b=${v.id}`} className="me-3 underline">Bandingkan dengan sebelumnya</Link>}
                          <Link href={`${base}?a=${v.id}`} className="underline">Bandingkan…</Link>
                        </td>
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
