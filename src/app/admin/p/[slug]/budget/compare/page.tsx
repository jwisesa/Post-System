import Link from "next/link";
import { notFound } from "next/navigation";
import { can } from "@/lib/auth/permissions";
import { categoryLabel, TAX_NOTE, VERSION_STATUSES, type VersionStatusCode } from "@/lib/budget/catalog";
import { compareVersions, type Side } from "@/lib/budget/compare";
import { formatQty, formatRateBp, formatRupiah } from "@/lib/budget/money";
import { getBudget } from "@/lib/budget/service";
import { loadProject } from "@/lib/project-context";
import { InputError } from "@/lib/services";

const KIND = { changed: "Berubah", added: "Baru", removed: "Hilang", same: "Sama" } as const;
const ROW = { changed: "cmp-changed", added: "cmp-added", removed: "cmp-removed", same: "" } as const;
const sign = (n: number) => (n === 0 ? "—" : `${n > 0 ? "+" : ""}${formatRupiah(n)}`);
const tone = (n: number) => (n > 0 ? "text-danger" : "muted");
const dash = (s?: string) => s ?? "—";

function Head({ s, label }: { s: Side; label: string }) {
  return (
    <div className="space-y-0.5">
      <p className="muted text-xs">{label}</p>
      <p className="font-medium">{s.vendor} · v{s.number}</p>
      <p className="text-sm"><span className={`tag ${s.status === "approved" ? "tag-ok" : s.status === "rejected" ? "tag-danger" : ""}`}>{VERSION_STATUSES[s.status as VersionStatusCode]}</span> <span className="muted">{s.docDate ?? "tanpa tanggal"}{s.ref && ` · ${s.ref}`} · {s.scope}</span></p>
    </div>
  );
}

export default async function BudgetComparePage({ params, searchParams }: { params: Promise<{ slug: string }>; searchParams: Promise<{ a?: string; b?: string }> }) {
  const { slug } = await params;
  const sp = await searchParams;
  const { db, project, role, user } = await loadProject(slug);
  if (!can(role, "budget.view")) notFound();
  const data = await getBudget(db, user.id, project.id);
  const a = sp.a ?? "", b = sp.b ?? "";
  let c: Awaited<ReturnType<typeof compareVersions>> | null = null, error = "";
  if (a || b) {
    try { c = await compareVersions(db, user.id, project.id, a, b); } catch (e) { if (e instanceof InputError) error = e.message; else throw e; }
  }
  // scope > vendor > versions
  const groups = data.scopes.map((s) => ({
    scope: s,
    bids: data.bids.filter((x) => x.scopeId === s.id).map((bid) => ({
      vendor: data.vendors.find((v) => v.id === bid.vendorId)?.name ?? "—",
      versions: data.versions.filter((v) => data.docs.some((d) => d.id === v.docId && d.bidId === bid.id && d.kind === "quote")),
    })).filter((x) => x.versions.length),
  })).filter((g) => g.bids.length);
  const options = groups.map((g) => (
    <optgroup key={g.scope.id} label={`${g.scope.name} (${categoryLabel(g.scope.category)})`}>
      {g.bids.flatMap((x) => x.versions.map((v) => <option key={v.id} value={v.id}>{x.vendor} · v{v.number} · {VERSION_STATUSES[v.status as VersionStatusCode]}</option>))}
    </optgroup>
  ));
  const count = (k: string) => c?.diff.rows.filter((r) => r.kind === k).length ?? 0;
  const summary = [[count("changed"), "berubah"], [count("added"), "baru"], [count("removed"), "hilang"]].filter(([n]) => n).map(([n, l]) => `${n} ${l}`).join(", ") || "Tidak ada perbedaan";
  const net = (x: Side) => x.subtotal + x.ppn - x.pph23;
  const tot = c ? [["Subtotal (sebelum pajak)", c.a.subtotal, c.b.subtotal], ["PPN (perkiraan)", c.a.ppn, c.b.ppn], ["PPh 23 (perkiraan)", c.a.pph23, c.b.pph23], ["Net (perkiraan)", net(c.a), net(c.b)]] as const : [];
  return (
    <div className="page space-y-4">
      <div>
        <p className="page-meta"><Link href={`/admin/p/${slug}/budget`}>Anggaran & vendor</Link></p>
        <h1 className="page-title">Bandingkan penawaran</h1>
      </div>
      <form method="get" className="flex flex-wrap items-end gap-2">
        <label className="grid gap-1 text-sm">Lama<select name="a" defaultValue={a}><option value="">Pilih versi…</option>{options}</select></label>
        <label className="grid gap-1 text-sm">Baru<select name="b" defaultValue={b}><option value="">Pilih versi…</option>{options}</select></label>
        <button className="btn-secondary">Bandingkan</button>
      </form>
      {error && <p className="text-danger text-sm" role="alert">{error}</p>}
      {!c && !error && <p className="muted text-sm">Pilih dua versi untuk dibandingkan. Boleh beda vendor.</p>}
      {c && (
        <>
          <div className="grid gap-4 sm:grid-cols-2"><Head s={c.a} label="Lama" /><Head s={c.b} label="Baru" /></div>
          <div className="flex flex-wrap items-center justify-between gap-2">
            <p className="text-sm font-medium">{summary}</p>
            <a className="btn-secondary" href={`/admin/p/${slug}/budget/compare/export?a=${encodeURIComponent(c.a.id)}&b=${encodeURIComponent(c.b.id)}`} download>Unduh CSV</a>
          </div>
          <div className="overflow-x-auto">
            <table className="table w-full text-sm">
              <thead><tr><th className="text-start">Item</th><th className="text-start">Status</th><th className="bg-num">Qty lama</th><th className="bg-num">Qty baru</th><th className="bg-num">Harga lama</th><th className="bg-num">Harga baru</th><th className="bg-num">Jumlah Rp lama</th><th className="bg-num">Jumlah Rp baru</th><th className="bg-num">Selisih</th></tr></thead>
              <tbody>
                {c.diff.rows.length === 0 && <tr><td colSpan={9} className="muted">Kedua versi tidak punya item (lump sum).</td></tr>}
                {c.diff.rows.map((r, i) => (
                  <tr key={`${r.key}-${i}`} className={ROW[r.kind]}>
                    <td>{r.item}{r.oldItem && <span className="muted"> (dulu {r.oldItem})</span>}</td>
                    <td><span className={`tag ${r.kind === "added" ? "tag-ok" : r.kind === "removed" ? "tag-danger" : r.kind === "changed" ? "tag-warn" : ""}`}>{KIND[r.kind]}</span></td>
                    <td className="bg-num">{dash(r.a && `${formatQty(r.a.qtyMilli)} ${r.a.unit}`)}</td>
                    <td className="bg-num">{dash(r.b && `${formatQty(r.b.qtyMilli)} ${r.b.unit}`)}</td>
                    <td className="bg-num">{dash(r.a && formatRupiah(r.a.unitPrice))}</td>
                    <td className="bg-num">{dash(r.b && formatRupiah(r.b.unitPrice))}</td>
                    <td className="bg-num">{dash(r.a && formatRupiah(r.a.amount))}</td>
                    <td className="bg-num">{dash(r.b && formatRupiah(r.b.amount))}</td>
                    <td className={`bg-num ${tone(r.delta)}`}>{sign(r.delta)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="overflow-x-auto">
            <table className="table w-full text-sm">
              <thead><tr><th className="text-start">Total</th><th className="bg-num">Lama</th><th className="bg-num">Baru</th><th className="bg-num">Selisih</th></tr></thead>
              <tbody>{tot.map(([l, x, y]) => <tr key={l}><td>{l}</td><td className="bg-num">{formatRupiah(x)}</td><td className="bg-num">{formatRupiah(y)}</td><td className={`bg-num ${tone(y - x)}`}>{sign(y - x)}</td></tr>)}</tbody>
            </table>
          </div>
          <p className="muted text-xs">{TAX_NOTE}</p>
          {c.ratesDiffer && <p className="muted text-xs">Tarif pajak kedua versi berbeda (PPN {formatRateBp(c.a.ppnRateBp) || "tanpa"}% vs {formatRateBp(c.b.ppnRateBp) || "tanpa"}%, PPh 23 {formatRateBp(c.a.pph23RateBp) || "tanpa"}% vs {formatRateBp(c.b.pph23RateBp) || "tanpa"}%), jadi selisih pajak ikut dipengaruhi tarif.</p>}
        </>
      )}
    </div>
  );
}
