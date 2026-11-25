"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { addScopeBid, chooseBid, removeBid, removeScope } from "@/app/admin/budget-actions";
import { ConfirmButton } from "@/components/ui/controls";
import { useToast } from "@/components/ui/toast";
import { CANCEL_MARK, TAX_NOTE, VERSION_STATUSES, type VersionStatusCode } from "@/lib/budget/catalog";
import { fmt } from "@/lib/budget/money";
import type { VendorCmp } from "@/lib/budget/vendors";
import { ScopeDrawer, type Option, type ScopeForm } from "./BudgetView";
import { InvoiceTable, type DocOption, type InvoiceRow } from "./InvoiceParts";
import { StatusSelect } from "./StatusSelect";
import { VersionDrawer, type PrefillLine } from "./VersionDrawer";

export type VersionRow = { id: string; number: number; ref: string; docDate: string | null; status: VersionStatusCode; subtotal: number; ppn: number; pph23: number; ppnRateBp: number | null; pph23RateBp: number | null; notes: string; statusNote: string; links: string[]; authorName: string; lines: PrefillLine[] };
export type CoSeries = { docId: string; title: string; versions: VersionRow[] };
export type BidView = { id: string; vendor: string; vendorId: string; docId: string; picked: boolean; versions: VersionRow[]; changeOrders: CoSeries[]; invoices: InvoiceRow[]; docs: DocOption[]; ppnBp: number | null; pph23Bp: number | null };

const shortDate = (d: string | null) => (d ? new Date(`${d}T00:00:00`).toLocaleDateString("id-ID", { day: "numeric", month: "short" }) : "—");

function VersionTable({ slug, canEdit, versions, base, vendor }: { slug: string; canEdit: boolean; versions: VersionRow[]; base: string; vendor: string }) {
  const newest = [...versions].reverse();
  return (
              <div className="overflow-x-auto">
                <table className="table w-full text-sm">
                  <thead><tr><th className="text-start">No</th><th className="text-start">Tanggal</th><th className="text-start">Status</th><th className="bg-num">DPP (Rp)</th><th className="bg-num" title="DPP + PPN − PPh 23, perkiraan">Net perk. (Rp)</th><th className="text-start">Catatan</th><th className="text-start">Links</th><th /></tr></thead>
                  <tbody>
                    {newest.map((v, ni) => {
                      const prev = newest[ni + 1];
                      return (
                      <tr key={v.id} aria-current={v.status === "approved" ? "true" : undefined} style={v.status === "approved" ? { background: "color-mix(in srgb, var(--ok) 8%, transparent)" } : undefined}>
                        <td className="tabular-nums">v{v.number}{v.ref && <span className="muted"> {v.ref}</span>}</td>
                        <td className="tabular-nums whitespace-nowrap" title={v.docDate ?? undefined}>{shortDate(v.docDate)}{v.authorName && <> · <span className="muted">{v.authorName}</span></>}</td>
                        <td className="whitespace-nowrap"><span className={`tag ${v.status === "approved" ? "tag-ok" : v.status === "rejected" ? "tag-danger" : ""}`} style={v.status === "superseded" ? { opacity: 0.7 } : undefined}>{VERSION_STATUSES[v.status]}</span>{canEdit && <StatusSelect slug={slug} versionId={v.id} status={v.status} number={v.number} vendor={vendor} />}</td>
                        <td className="bg-num">{fmt(v.subtotal)}</td>
                        <td className="bg-num" title={`PPN ${fmt(v.ppn)} · PPh 23 ${fmt(v.pph23)}`}>{fmt(v.subtotal + v.ppn - v.pph23)}</td>
                        <td className="max-w-[18rem]"><span className="line-clamp-2" title={v.notes}>{v.notes}</span></td>
                        <td>{v.links.map((l, i) => <a key={l} href={l} target="_blank" rel="noreferrer noopener" className="me-2 underline">Link {i + 1}</a>)}</td>
                        <td className="whitespace-nowrap text-sm">
                          {v.status === "negotiating" && v.statusNote.startsWith(CANCEL_MARK) && <span className="tag tag-warn">persetujuan dibatalkan</span>}
                          <Link href={prev ? `${base}?a=${prev.id}&b=${v.id}` : `${base}?a=${v.id}`} className="underline">Bandingkan</Link>
                        </td>
                      </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
  );
}

export function ScopeView({ slug, canEdit, today, scope, bids, addable, phases, deliverables, cmp }: { slug: string; canEdit: boolean; today: string; cmp: VendorCmp[]; scope: ScopeForm; bids: BidView[]; addable: Option[]; phases: Option[]; deliverables: Option[] }) {
  const toast = useToast();
  const router = useRouter();
  const [editing, setEditing] = useState(false);
  const [adding, setAdding] = useState<{ bid: BidView; co?: CoSeries | "new" } | null>(null);
  const [vendorId, setVendorId] = useState("");
  const [sel, setSel] = useState<string[]>([]);
  const latestOf = (id: string) => cmp.find((c) => c.bidId === id)?.latestVersionId;
  const pair = sel.map(latestOf).filter(Boolean);
  const base = `/admin/p/${slug}/budget/compare`;
  const STATE = (c: VendorCmp) => c.state === "none" ? <span className="muted">Belum ada penawaran</span> : c.state === "provisional" ? <><span className="tag tag-warn">perkiraan</span>{c.cancelled && <span className="tag tag-warn">persetujuan dibatalkan</span>}</> : c.state === "pinned" ? <span className="tag tag-ok">Terpilih</span> : <span className="tag tag-ok">Disetujui</span>;
  const [busy, setBusy] = useState<string | null>(null);
  const valued = cmp.filter((c) => c.state !== "none").length >= 2;
  const act = async (key: string, p: () => Promise<{ ok: boolean; error?: string }>, done: string, then?: () => void) => {
    if (busy) return;
    setBusy(key);
    const r = await p();
    setBusy(null);
    toast(r.ok ? { message: done } : { message: r.error ?? "Gagal.", tone: "error" });
    if (r.ok) { then?.(); router.refresh(); }
  };
  return (
    <div className="space-y-6">
      {canEdit && (
        <div className="flex flex-wrap items-center gap-2">
          <button type="button" className="btn-secondary" onClick={() => setEditing(true)}>Ubah lingkup</button>
          <form action={async () => act("rm", () => removeScope(slug, scope.id!), "Lingkup dihapus.", () => router.push(`/admin/p/${slug}/budget`))}>
            <ConfirmButton className="btn-ghost" message={`Hapus lingkup "${scope.name}" beserta semua penawaran dan versinya? Tidak bisa dibatalkan.`}>Hapus lingkup</ConfirmButton>
          </form>
        </div>
      )}
      {canEdit && addable.length > 0 && (
        <div className="flex flex-wrap items-center gap-2">
          <select aria-label="Vendor" value={vendorId} onChange={(e) => setVendorId(e.target.value)}><option value="">Pilih vendor…</option>{addable.map((v) => <option key={v.id} value={v.id}>{v.name}</option>)}</select>
          <button type="button" className="btn-secondary" disabled={!vendorId || !!busy} onClick={() => act("add", () => addScopeBid(slug, scope.id!, vendorId), "Vendor ditambahkan.", () => setVendorId(""))}>{busy === "add" ? "Menyimpan…" : "Tambah vendor ke lingkup"}</button>
        </div>
      )}
      {cmp.length > 0 && (
        <section className="space-y-2">
          <h2 className="text-sm font-semibold">Perbandingan vendor</h2>
          <div className="overflow-x-auto">
            <table className="table w-full text-sm">
              <thead><tr><th /><th className="text-start">Vendor</th><th className="bg-num">Nilai sebelum pajak (Rp)</th><th className="text-start">Status nilai</th><th className="bg-num">Selisih vs budget (Rp)</th><th className="bg-num">Vs termurah (Rp)</th><th className="bg-num">Versi</th><th className="text-start">Status terakhir</th><th /></tr></thead>
              <tbody>
                {cmp.map((c) => (
                  <tr key={c.bidId}>
                    <td><input type="checkbox" aria-label={`Pilih ${c.vendor} untuk dibandingkan`} disabled={!c.latestVersionId || (!sel.includes(c.bidId) && sel.length >= 2)} checked={sel.includes(c.bidId)} onChange={(e) => setSel(e.target.checked ? [...sel, c.bidId] : sel.filter((x) => x !== c.bidId))} /></td>
                    <td className="font-medium">{c.vendor} {c.chosen ? <span className="tag tag-ok">Dipilih</span> : <span className="tag">Alternatif</span>}</td>
                    <td className="bg-num">{c.state === "none" ? "—" : fmt(c.value)}</td>
                    <td>{STATE(c)}</td>
                    <td className={`bg-num ${c.vsBudget != null && c.vsBudget < 0 ? "text-danger" : ""}`}>{c.vsBudget == null ? "—" : fmt(c.vsBudget)}</td>
                    <td className="bg-num">{!valued || c.vsCheapest == null ? "—" : c.cheapest ? <span className="tag tag-ok">Termurah</span> : `+${fmt(c.vsCheapest)}`}</td>
                    <td className="bg-num">{c.versions}</td>
                    <td>{c.lastStatus ? VERSION_STATUSES[c.lastStatus as VersionStatusCode] : "—"}</td>
                    <td>{canEdit && !c.chosen && <button type="button" className="btn-secondary" disabled={!!busy} onClick={() => act(`p${c.bidId}`, () => chooseBid(slug, scope.id!, c.bidId), "Vendor dipilih.")}>{busy === `p${c.bidId}` ? "Menyimpan…" : "Pilih vendor ini"}</button>}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {pair.length === 2 ? <Link className="btn-secondary" href={`${base}?a=${pair[0]}&b=${pair[1]}`}>Bandingkan versi terbaru kedua vendor</Link> : <p className="muted text-xs">Centang dua vendor untuk membandingkan versi terbarunya. Nilai = penawaran + change order disetujui; semua sebelum pajak (DPP).</p>}
        </section>
      )}
      {bids.some((b) => b.versions.length > 0) && <p className="muted text-xs">{TAX_NOTE}</p>}
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
                  <button type="button" className="btn" onClick={() => setAdding({ bid: b })}>Versi baru</button>
                  <form action={async () => act("rb", () => removeBid(slug, b.id), "Vendor dihapus dari lingkup.")}><ConfirmButton className="btn-ghost" message={`Hapus ${b.vendor} dari lingkup ini beserta semua versinya?`}>Hapus</ConfirmButton></form>
                </>
              )}
            </div>
            {b.versions.length === 0 ? <p className="muted text-sm">Belum ada versi penawaran.</p> : (
              <VersionTable slug={slug} canEdit={canEdit} versions={b.versions} base={base} vendor={b.vendor} />
            )}
            {latest && <div className="space-y-2">
              <div className="flex flex-wrap items-center gap-2">
                <h3 className="text-sm font-semibold">Tambahan pekerjaan</h3>
                {canEdit && <button type="button" className="btn-secondary" onClick={() => setAdding({ bid: b, co: "new" })}>Tambahan baru</button>}
              </div>
              {b.changeOrders.length === 0 && <p className="muted text-sm">Belum ada change order.</p>}
              {b.changeOrders.map((c) => {
                const last = c.versions[c.versions.length - 1];
                return (
                  <div key={c.docId} className="space-y-1">
                    <p className="flex flex-wrap items-center gap-2 text-sm"><span className="font-medium">{c.title}</span>{last && last.subtotal < 0 && <span className="tag">Pengurangan</span>}{canEdit && <button type="button" className="btn-ghost" onClick={() => setAdding({ bid: b, co: c })}>Versi baru</button>}</p>
                    <VersionTable slug={slug} canEdit={canEdit} versions={c.versions} base={base} vendor={b.vendor} />
                  </div>
                );
              })}
              {b.changeOrders.some((c) => c.versions.some((v) => v.status === "approved")) && b.versions.length > 1 && <p className="muted text-xs">Pastikan tambahan pekerjaan belum termasuk di versi penawaran terbaru.</p>}
            </div>}
            <InvoiceTable slug={slug} canEdit={canEdit} today={today} invoices={b.invoices} scopeId={scope.id!} vendorId={b.vendorId} vendor={b.vendor} ppnBp={b.ppnBp} pph23Bp={b.pph23Bp} docs={b.docs} />
            {adding?.bid.id === b.id && (() => {
              const c = adding.co;
              const series = c && c !== "new" ? c : null;
              const lv = series ? series.versions[series.versions.length - 1] : c ? undefined : latest;
              return <VersionDrawer key={`${b.id}${series?.docId ?? c ?? ""}`} slug={slug} docId={series ? series.docId : b.docId} co={c === "new" ? { bidId: b.id } : undefined} negative={!!c} vendor={series ? `${b.vendor} · ${series.title}` : b.vendor} prefill={lv?.lines ?? []} ppnBp={lv ? lv.ppnRateBp : b.ppnBp} pph23Bp={lv ? lv.pph23RateBp : b.pph23Bp} first={!lv} fromNumber={lv?.number} onClose={() => setAdding(null)} />;
            })()}
          </section>
        );
      })}
      {editing && <ScopeDrawer slug={slug} init={scope} phases={phases} deliverables={deliverables} onClose={() => setEditing(false)} />}
    </div>
  );
}
