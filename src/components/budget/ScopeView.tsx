"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { Fragment, useState } from "react";
import { addScopeBid, chooseBid, removeBid, removeScope } from "@/app/admin/budget-actions";
import { ConfirmButton } from "@/components/ui/controls";
import { Popover } from "@/components/ui/popover";
import { Section } from "@/components/ui/section";
import { useToast } from "@/components/ui/toast";
import { CANCEL_MARK, VERSION_STATUSES, type VersionStatusCode } from "@/lib/budget/catalog";
import { fmt, formatRupiah } from "@/lib/budget/money";
import { ExportMenu } from "./ExportMenu";
import type { VendorCmp } from "@/lib/budget/vendors";
import { ScopeDrawer, type Option, type ScopeForm } from "./BudgetView";
import { InvoiceTable, type DocOption, type InvoiceRow } from "./InvoiceParts";
import { StatusSelect } from "./StatusSelect";
import type { BudgetLine } from "@/db/schema";
import { LinesView } from "./LinesView";
import { VersionDrawer, type SeedItem } from "./VersionDrawer";

export type VersionRow = { id: string; number: number; ref: string; docDate: string | null; status: VersionStatusCode; subtotal: number; ppn: number; pph23: number; ppnRateBp: number | null; pph23RateBp: number | null; notes: string; statusNote: string; links: string[]; authorName: string; lines: BudgetLine[]; pricing: "items" | "lump"; corrected: boolean };
export type CoSeries = { docId: string; title: string; versions: VersionRow[] };
export type BidView = { id: string; vendor: string; vendorId: string; docId: string; picked: boolean; versions: VersionRow[]; changeOrders: CoSeries[]; invoices: InvoiceRow[]; docs: DocOption[]; ppnBp: number | null; pph23Bp: number | null };

const shortDate = (d: string | null) => (d ? new Date(`${d}T00:00:00`).toLocaleDateString("id-ID", { day: "numeric", month: "short" }) : "—");

function VersionTable({ slug, canEdit, versions, base, vendor, onCorrect, from = 0, to }: { from?: number; to?: number; onCorrect?: (v: VersionRow) => void; slug: string; canEdit: boolean; versions: VersionRow[]; base: string; vendor: string }) {
  const newest = [...versions].reverse();
  return (
              <div className="overflow-x-auto">
                <table className="table w-full text-sm">
                  <thead><tr><th className="text-start">No</th><th className="text-start">Tanggal</th><th className="text-start">Status</th><th className="bg-num">DPP (Rp)</th><th className="bg-num" title="DPP + PPN − PPh 23, perkiraan">Net perk. (Rp)</th><th className="text-start">Catatan</th><th className="text-start">Links</th><th /></tr></thead>
                  <tbody>
                    {newest.slice(from, to).map((v, k) => {
                      const ni = from + k;
                      const prev = newest[ni + 1];
                      return (
                      <Fragment key={v.id}>
                      <tr aria-current={v.status === "approved" ? "true" : undefined} style={v.status === "approved" ? { background: "color-mix(in srgb, var(--ok) 8%, transparent)" } : undefined}>
                        <td className="tabular-nums">v{v.number}{v.corrected && <span className="muted"> · dikoreksi</span>}{v.pricing === "lump" && <span className="tag ms-1">lump sum</span>}{v.ref && <span className="muted"> {v.ref}</span>}</td>
                        <td className="tabular-nums whitespace-nowrap" title={v.docDate ?? undefined}>{shortDate(v.docDate)}{v.authorName && <> · <span className="muted">{v.authorName}</span></>}</td>
                        <td className="whitespace-nowrap"><span className={`tag ${v.status === "approved" ? "tag-ok" : v.status === "rejected" ? "tag-danger" : ""}`} style={v.status === "superseded" ? { opacity: 0.7 } : undefined}>{VERSION_STATUSES[v.status]}</span></td>
                        <td className="bg-num">{fmt(v.subtotal)}</td>
                        <td className="bg-num" title={`PPN ${fmt(v.ppn)} · PPh 23 ${fmt(v.pph23)}`}>{fmt(v.subtotal + v.ppn - v.pph23)}</td>
                        <td className="max-w-[18rem]"><span className="line-clamp-2" title={v.notes}>{v.notes}</span></td>
                        <td>{v.links.map((l, i) => <a key={l} href={l} target="_blank" rel="noreferrer noopener" className="me-2 underline">Link {i + 1}</a>)}</td>
                        <td className="whitespace-nowrap text-sm">
                          {v.status === "negotiating" && v.statusNote.startsWith(CANCEL_MARK) && <span className="tag tag-warn">persetujuan dibatalkan</span>}
                          {canEdit && onCorrect && ni === 0 && <button type="button" className="btn-ghost me-2" onClick={() => onCorrect(v)}>Koreksi</button>}
                          {canEdit && <span className="me-2"><StatusSelect slug={slug} versionId={v.id} status={v.status} number={v.number} vendor={vendor} /></span>}
                          <Link href={prev ? `${base}?a=${prev.id}&b=${v.id}` : `${base}?a=${v.id}`} className="underline">Bandingkan</Link>
                        </td>
                      </tr>
                      {v.lines.length > 0 && <tr><td colSpan={8} className="!py-0"><details className="py-1.5"><summary className="muted cursor-pointer text-xs">Rincian ({v.lines.length} baris)</summary><div className="overflow-x-auto py-2"><LinesView lines={v.lines} /></div></details></td></tr>}
                      </Fragment>
                      );
                    })}
                  </tbody>
                </table>
              </div>
  );
}

function AddVendor({ addable, busy, onAdd }: { addable: Option[]; busy: boolean; onAdd: (id: string, close: () => void) => void }) {
  const [id, setId] = useState("");
  return (
    <Popover className="btn-secondary" label="Tambah vendor ke lingkup" trigger="+ Vendor">
      {(close) => (
        <div className="field-pop" style={{ minWidth: "14rem" }}>
          <select aria-label="Vendor" value={id} onChange={(e) => setId(e.target.value)}><option value="">Pilih vendor…</option>{addable.map((v) => <option key={v.id} value={v.id}>{v.name}</option>)}</select>
          <button type="button" className="btn" disabled={!id || busy} style={{ justifyContent: "center" }} onClick={() => { onAdd(id, close); setId(""); }}>{busy ? "Menyimpan…" : "Tambah ke lingkup"}</button>
        </div>
      )}
    </Popover>
  );
}

const stageTag = (st?: string | null) => st === "disetujui" ? <span className="tag tag-ok">Disetujui</span> : st === "masuk" ? <span className="tag tag-warn">Masuk budget</span> : <span className="tag">Alternatif</span>;

export function ScopeView({ slug, canEdit, today, scope, meta, top, bids, addable, phases, deliverables, cmp, seeds = [], children }: { children?: React.ReactNode; top?: React.ReactNode; meta: React.ReactNode; seeds?: SeedItem[]; slug: string; canEdit: boolean; today: string; cmp: VendorCmp[]; scope: ScopeForm; bids: BidView[]; addable: Option[]; phases: Option[]; deliverables: Option[] }) {
  const toast = useToast();
  const router = useRouter();
  const [editing, setEditing] = useState(false);
  const [adding, setAdding] = useState<{ bid: BidView; co?: CoSeries | "new"; fix?: VersionRow; fixCo?: CoSeries } | null>(null);
  const [sel, setSel] = useState<string[]>([]);
  const latestOf = (id: string) => cmp.find((c) => c.bidId === id)?.latestVersionId;
  const pair = sel.map(latestOf).filter(Boolean);
  const base = `/admin/p/${slug}/budget/compare`;
  const STATE = (c: VendorCmp) => c.state === "none" ? <span className="muted">Belum ada penawaran</span> : c.state === "provisional" ? <><span className="tag tag-warn">perkiraan</span>{c.cancelled && <span className="tag tag-warn">persetujuan dibatalkan</span>}</> : c.state === "pinned" ? <span className="tag">Masuk budget</span> : <span className="tag tag-ok">Disetujui</span>;
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
  const unpaid = bids.some((b) => b.invoices.some((i) => i.status !== "cancelled" && i.payments.reduce((n, p) => n + p.amount, 0) < i.subtotal + i.ppn - i.pph23));
  const exportItems = [{ href: `/admin/p/${slug}/budget/export?type=versions&scope=${scope.id}`, label: "CSV versi penawaran", kind: "csv" as const }, { href: `/admin/p/${slug}/budget/export?type=lines&scope=${scope.id}`, label: "CSV rincian item", kind: "csv" as const }, { href: `/admin/p/${slug}/budget/print?view=scope&scope=${scope.id}`, label: "PDF lingkup ini", kind: "pdf" as const }];
  return (
    <div className="space-y-5">
      <header className="page-head">
        <div>
          <h1 className="page-title">{scope.name}</h1>
          <p className="page-meta">{meta}</p>
        </div>
        <div className="page-actions">
          {canEdit && <button type="button" className="btn-secondary" onClick={() => setEditing(true)}>Ubah lingkup</button>}
          <ExportMenu items={exportItems} />
          {canEdit && (
            <Popover label="Lainnya" trigger={<span aria-hidden>⋯</span>}>
              {() => (
                <form action={async () => act("rm", () => removeScope(slug, scope.id!), "Lingkup dihapus.", () => router.push(`/admin/p/${slug}/budget`))}>
                  <ConfirmButton className="text-danger" style={{ display: "flex", inlineSize: "100%", padding: "0.5rem 0.625rem", textAlign: "start" }} message={`Hapus lingkup "${scope.name}" beserta semua penawaran dan versinya? Tidak bisa dibatalkan.`}>Hapus lingkup</ConfirmButton>
                </form>
              )}
            </Popover>
          )}
        </div>
      </header>
      {top}
      <div>
        <Section id="compare" title="Perbandingan vendor" actions={canEdit && addable.length > 0 ? <AddVendor addable={addable} busy={busy === "add"} onAdd={(id, close) => act("add", () => addScopeBid(slug, scope.id!, id), "Vendor ditambahkan.", close)} /> : undefined}>
          {cmp.length === 0 ? <p className="muted text-sm">Belum ada vendor di lingkup ini.{canEdit && addable.length === 0 && " Tambahkan vendor di tab Vendor dulu."}</p> : (
            <div className="space-y-2">
              <div className="overflow-x-auto">
                <table className="table w-full text-sm">
                  <thead><tr><th><span className="sr-only">Pilih</span></th><th className="text-start">Vendor</th><th className="bg-num">Nilai sebelum pajak (Rp)</th><th className="text-start">Status nilai</th><th className="bg-num">Selisih vs budget (Rp)</th><th className="bg-num">Vs termurah (Rp)</th><th className="bg-num">Versi</th><th className="text-start">Status terakhir</th><th /></tr></thead>
                  <tbody>
                    {cmp.map((c) => (
                      <tr key={c.bidId}>
                        <td><input type="checkbox" aria-label={`Pilih ${c.vendor} untuk dibandingkan`} disabled={!c.latestVersionId || (!sel.includes(c.bidId) && sel.length >= 2)} checked={sel.includes(c.bidId)} onChange={(e) => setSel(e.target.checked ? [...sel, c.bidId] : sel.filter((x) => x !== c.bidId))} /></td>
                        <td className="font-medium">{c.vendor} {stageTag(c.stage)}</td>
                        <td className="bg-num">{c.state === "none" ? "—" : fmt(c.value)}</td>
                        <td>{STATE(c)}</td>
                        <td className={`bg-num ${c.vsBudget != null && c.vsBudget < 0 ? "text-danger" : ""}`}>{c.vsBudget == null ? "—" : fmt(c.vsBudget)}</td>
                        <td className="bg-num">{!valued || c.vsCheapest == null ? "—" : c.cheapest ? <span className="tag tag-ok">Termurah</span> : `+${fmt(c.vsCheapest)}`}</td>
                        <td className="bg-num">{c.versions}</td>
                        <td>{c.lastStatus ? VERSION_STATUSES[c.lastStatus as VersionStatusCode] : "—"}</td>
                        <td>{canEdit && !c.chosen && <button type="button" className="btn-secondary" disabled={!!busy} onClick={() => act(`p${c.bidId}`, () => chooseBid(slug, scope.id!, c.bidId), "Vendor masuk budget.")}>{busy === `p${c.bidId}` ? "Menyimpan…" : "Masukkan ke budget"}</button>}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <p className="flex flex-wrap items-center gap-2 text-xs">
                {pair.length === 2 ? <Link className="btn-secondary" href={`${base}?a=${pair[0]}&b=${pair[1]}`}>Bandingkan</Link> : <span className="btn-secondary" aria-disabled="true" style={{ opacity: 0.5, cursor: "not-allowed" }}>Bandingkan</span>}
                <span className="muted">Centang dua vendor untuk membandingkan versi terbarunya. Nilai = penawaran + change order disetujui; semua sebelum pajak (DPP).</span>
              </p>
            </div>
          )}
        </Section>
        {bids.map((b) => {
          const latest = b.versions[b.versions.length - 1];
          const c = cmp.find((x) => x.bidId === b.id);
          const st = c?.stage;
          const digest = latest ? <span className="bg-digest">v{latest.number} · {VERSION_STATUSES[latest.status]}{c && c.state !== "none" && <> · {formatRupiah(c.value)}</>}{c && valued && c.vsCheapest != null && (c.cheapest ? " · Termurah" : ` · +${formatRupiah(c.vsCheapest)} vs termurah`)}</span> : <span className="muted">Belum ada versi</span>;
          return (
            <Section key={b.id} id={`vendor-${b.id}`} defaultOpen={st === "disetujui" || st === "masuk" || bids.length === 1} title={<>{b.vendor} {stageTag(st)}</>} digest={digest}
              actions={canEdit ? <>
                <button type="button" className="btn" onClick={() => setAdding({ bid: b })}>Versi baru</button>
                <form action={async () => act("rb", () => removeBid(slug, b.id), "Vendor dihapus dari lingkup.")}><ConfirmButton className="btn-ghost" message={`Hapus ${b.vendor} dari lingkup ini beserta semua versinya?`}>Hapus</ConfirmButton></form>
              </> : undefined}>
              <div className="space-y-3">
                {b.versions.length === 0 ? <p className="muted text-sm">Belum ada versi penawaran.</p> : (
                  <>
                    <VersionTable slug={slug} canEdit={canEdit} versions={b.versions} base={base} vendor={b.vendor} to={1} onCorrect={(v) => setAdding({ bid: b, fix: v })} />
                    {b.versions.length > 1 && <details><summary className="muted cursor-pointer text-sm">{b.versions.length - 1} versi sebelumnya</summary><VersionTable slug={slug} canEdit={canEdit} versions={b.versions} base={base} vendor={b.vendor} from={1} onCorrect={(v) => setAdding({ bid: b, fix: v })} /></details>}
                  </>
                )}
                {latest && (b.changeOrders.length === 0 ? (canEdit && <button type="button" className="btn-secondary" onClick={() => setAdding({ bid: b, co: "new" })}>Tambahan pekerjaan baru</button>) : (
                  <details>
                    <summary className="cursor-pointer text-sm font-semibold">Tambahan pekerjaan <span className="muted font-normal">· {b.changeOrders.length}</span></summary>
                    <div className="mt-2 space-y-2">
                      {canEdit && <button type="button" className="btn-secondary" onClick={() => setAdding({ bid: b, co: "new" })}>Tambahan baru</button>}
                      {b.changeOrders.map((co) => {
                        const last = co.versions[co.versions.length - 1];
                        return (
                          <div key={co.docId} className="space-y-1">
                            <p className="flex flex-wrap items-center gap-2 text-sm"><span className="font-medium">{co.title}</span>{last && last.subtotal < 0 && <span className="tag">Pengurangan</span>}{canEdit && <button type="button" className="btn-ghost" onClick={() => setAdding({ bid: b, co })}>Versi baru</button>}</p>
                            <VersionTable slug={slug} canEdit={canEdit} versions={co.versions} base={base} vendor={b.vendor} onCorrect={(v) => setAdding({ bid: b, co, fix: v })} />
                          </div>
                        );
                      })}
                      {b.changeOrders.some((co) => co.versions.some((v) => v.status === "approved")) && b.versions.length > 1 && <p className="muted text-xs">Pastikan tambahan pekerjaan belum termasuk di versi penawaran terbaru.</p>}
                    </div>
                  </details>
                ))}
              </div>
            </Section>
          );
        })}
        {bids.length > 0 && (
          <Section id="tagihan" title="Tagihan & termin" defaultOpen={unpaid} digest={unpaid ? undefined : <span className="muted">Semua lunas atau belum ada tagihan</span>}>
            <div className="space-y-5">
              {bids.map((b) => <InvoiceTable key={b.id} slug={slug} canEdit={canEdit} today={today} invoices={b.invoices} scopeId={scope.id!} vendorId={b.vendorId} vendor={b.vendor} ppnBp={b.ppnBp} pph23Bp={b.pph23Bp} docs={b.docs} />)}
            </div>
          </Section>
        )}
        {children}
      </div>
      {adding && (() => {
        const b = adding.bid;
        const latest = b.versions[b.versions.length - 1];
        const c = adding.co;
        const series = c && c !== "new" ? c : null;
        const lv = adding.fix ?? (series ? series.versions[series.versions.length - 1] : c ? undefined : latest);
        return <VersionDrawer key={`${b.id}${series?.docId ?? c ?? ""}${adding.fix?.id ?? ""}`} seeds={c ? [] : seeds} prefillPricing={lv?.pricing} prefillSubtotal={lv?.subtotal} correct={adding.fix ? { versionId: adding.fix.id } : undefined} slug={slug} docId={series ? series.docId : b.docId} co={c === "new" ? { bidId: b.id } : undefined} negative={!!c} vendor={series ? `${b.vendor} · ${series.title}` : b.vendor} prefill={lv?.lines ?? []} ppnBp={lv ? lv.ppnRateBp : b.ppnBp} pph23Bp={lv ? lv.pph23RateBp : b.pph23Bp} first={!lv} fromNumber={lv?.number} onClose={() => setAdding(null)} />;
      })()}
      {editing && <ScopeDrawer slug={slug} init={scope} phases={phases} deliverables={deliverables} onClose={() => setEditing(false)} />}
    </div>
  );
}
