"use client";

import { useRouter } from "next/navigation";
import { useMemo, useState } from "react";
import { removeDrive, reseedCalc, saveCalc, saveDrive, saveRateTable } from "@/app/admin/budget-actions";
import { ConfirmButton, Drawer } from "@/components/ui/controls";
import { useToast } from "@/components/ui/toast";
import { compareTracker, computeNeed, fmtTb, fmtTib, STAGE_LABEL, STAGES, type CamInput, type DriveCalc, type Stage } from "@/lib/budget/capacity";
import { matchRates, norm, type RateRow } from "@/lib/budget/datarates";
import type { DriveSummary } from "@/lib/drive-tracker/service";
import { DEFAULT_PPN_BP, TAX_NOTE } from "@/lib/budget/catalog";
import { formatRateBp, formatRupiah, lineAmount, MoneyError, parseRateBp, parseRupiah } from "@/lib/budget/money";

export type DriveLineRow = { id: string; purpose: string; media: string; capacityGb: number; qty: number; unitPrice: number; ppnRateBp: number | null; vendorId: string | null; vendor: string | null; neededBy: string | null; status: string; notes: string };
export type DriveProps = { scenarioId: string | null; scenarioName: string | null; isActive: boolean; scenarios: { id: string; name: string; isActive: boolean }[]; slug: string; canEdit: boolean; calc: DriveCalc; seeded: boolean; rates: RateRow[]; projectRateIds: string[]; tech: Record<string, string>; lines: DriveLineRow[]; vendors: { id: string; name: string }[]; tracker: DriveSummary | null };

const PURPOSES: Record<string, string> = { ocf: "OCF", proxy: "Proxy", grade: "Grading", vfx: "VFX", master: "Master", archive: "Arsip", other: "Lainnya" };
const MEDIA: Record<string, string> = { ssd: "SSD", hdd: "HDD", raid: "RAID", lto: "LTO", other: "Lainnya" };
const STATUS: Record<string, string> = { planned: "Rencana", ordered: "Dipesan", received: "Diterima", cancelled: "Batal" };
const GB = 1e9;

function Num({ value, onChange, step = "any", min = 0, label, hint, disabled, w }: { value: number | undefined; onChange: (n: number) => void; step?: string; min?: number; label: string; hint?: string; disabled?: boolean; w?: string }) {
  return <input type="number" inputMode="decimal" aria-label={label} placeholder={hint} min={min} step={step} disabled={disabled} className={w} value={value ?? ""} onChange={(e) => onChange(e.target.value === "" ? 0 : Number(e.target.value))} />;
}

function SourceLink({ r }: { r?: RateRow }) {
  if (!r) return null;
  return r.source ? <a href={r.source.url} target="_blank" rel="noreferrer noopener" className="underline">Sumber: {r.source.title}</a> : <span className="tag">proyek</span>;
}

function RatePick({ rates, value, onPick, candidates, disabled, label }: { rates: RateRow[]; value?: string; onPick: (id: string | undefined) => void; candidates: RateRow[]; disabled?: boolean; label: string }) {
  const rest = rates.filter((r) => !candidates.includes(r));
  return (
    <select aria-label={label} disabled={disabled} value={value ?? ""} onChange={(e) => onPick(e.target.value || undefined)}>
      <option value="">{candidates.length > 1 && !value ? "Pilih salah satu…" : "Isi Mbit/s manual"}</option>
      {candidates.length > 0 && <optgroup label="Cocok dengan Technical Page">{candidates.map((r) => <option key={r.id} value={r.id}>{r.label}</option>)}</optgroup>}
      <optgroup label="Semua baris">{rest.map((r) => <option key={r.id} value={r.id}>{r.maker} {r.label}</option>)}</optgroup>
    </select>
  );
}

export function DriveTab(p: DriveProps) {
  const { slug, canEdit } = p;
  const toast = useToast();
  const router = useRouter();
  const [calc, setCalc] = useState<DriveCalc>(p.calc);
  const [dirty, setDirty] = useState(false);
  const [busy, setBusy] = useState(false);
  const [line, setLine] = useState<DriveLineRow | "new" | null>(null);
  const [ratesOpen, setRatesOpen] = useState(false);
  const need = useMemo(() => computeNeed(calc, p.rates), [calc, p.rates]);
  const rateOf = (id?: string) => p.rates.find((r) => r.id === id);
  const upd = (f: (c: DriveCalc) => DriveCalc) => { setCalc(f); setDirty(true); };
  const run = async (fn: () => Promise<{ ok: boolean; error?: string }>, ok: string) => {
    setBusy(true);
    const r = await fn();
    setBusy(false);
    if (!r.ok) { toast({ message: r.error ?? "Gagal.", tone: "error" }); return false; }
    toast({ message: ok }); setDirty(false); router.refresh(); return true;
  };
  const camCands = (c: CamInput) => (c.slot ? matchRates(p.rates, { model: p.tech[`cam${c.slot}_model`], format: p.tech[c.slot === 1 ? "sourceFormat" : `cam${c.slot}_format`], res: p.tech[`cam${c.slot}_res`] }).map((m) => m.row) : []);
  const stageCands = (format: string, res: string) => matchRates(p.rates, { format: p.tech[format], res: p.tech[res] }).map((m) => m.row);
  const setCam = (id: string, patch: Partial<CamInput>) => upd((c) => ({ ...c, cameras: c.cameras.map((x) => (x.id === id ? { ...x, ...patch } : x)) }));
  const lines = p.lines;
  const planned = (s: Stage) => lines.filter((l) => l.purpose === s && l.status !== "cancelled").reduce((n, l) => n + l.capacityGb * GB * l.qty, 0);
  const ro = !canEdit;
  const total = lines.filter((l) => l.status !== "cancelled").reduce((n, l) => n + lineAmount(l.qty * 1000, l.unitPrice), 0);
  const cmp = p.tracker ? compareTracker(need, lines, p.tracker) : null;

  return (
    <div className="space-y-8">
      <div className="space-y-2">
        <div className="flex flex-wrap items-center gap-2 text-sm">
          <label className="flex items-center gap-2">Rencana
            <select aria-label="Rencana yang diedit" value={p.scenarioId ?? ""} onChange={(e) => router.push(`/admin/p/${slug}/budget?tab=drive${e.target.value ? `&scenario=${e.target.value}` : ""}`)}>
              {p.scenarios.map((s) => <option key={s.id} value={s.id}>{s.name}{s.isActive ? " (aktif)" : ""}</option>)}
            </select>
          </label>
          {p.scenarioName && <span className="tag">Rencana: {p.scenarioName}</span>}
          <span className="muted">Total belanja rencana ini <span className="tabular-nums">{formatRupiah(total)}</span>, sebelum pajak.</span>
        </div>
        {!p.isActive && p.scenarioName && <p className="text-sm font-medium" role="status">Anda {canEdit ? "mengedit" : "melihat"} {p.scenarioName} (belum aktif). Ringkasan anggaran tetap memakai rencana aktif.</p>}
      </div>
      <section className="space-y-3">
        <div className="flex flex-wrap items-center gap-2">
          <h2 className="text-base font-semibold">Kalkulator kapasitas</h2>
          <button type="button" className="btn-secondary" onClick={() => setRatesOpen(true)}>Tabel data rate</button>
          {canEdit && <ConfirmButton type="button" className="btn-secondary" message="Muat ulang kamera dan codec dari Technical Page? Isian kalkulator saat ini diganti." onClick={() => run(() => reseedCalc(slug, p.scenarioId ?? undefined), "Dimuat dari Technical Page.").then(() => router.refresh())}>Muat ulang dari Technical Page</ConfirmButton>}
        </div>
        <p className="muted text-sm">Perkiraan, bukan angka pasti. Kamera dan codec diambil dari Technical Page{p.seeded ? " (belum disimpan)" : ""}. Data rate di-skala linear terhadap fps (estimasi linear). Satuan TB desimal (1 TB = 10^12 byte), ≈ TiB sebagai pembanding.</p>
        <fieldset disabled={ro} className="min-w-0 space-y-3 border-0 p-0">
          <label className="flex flex-wrap items-center gap-2 text-sm">Hari syuting <Num label="Hari syuting" value={calc.shootDays} step="1" onChange={(n) => upd((c) => ({ ...c, shootDays: n }))} w="w-24" /></label>
          {calc.cameras.length === 0 && <p className="muted text-sm">Belum ada kamera di Technical Page. Isi kamera 1 di Technical Page, lalu muat ulang.</p>}
          <div className="overflow-x-auto">
            <table className="table w-full text-sm">
              <thead><tr><th className="text-start">Kamera</th><th className="text-start">Data rate</th><th className="bg-num">Mbit/s</th><th className="bg-num">fps</th><th className="bg-num">Unit</th><th className="bg-num">Menit/hari</th></tr></thead>
              <tbody>
                {calc.cameras.map((c) => {
                  const cands = camCands(c);
                  const top = cands.length ? matchRates(p.rates, { model: p.tech[`cam${c.slot}_model`], format: p.tech[c.slot === 1 ? "sourceFormat" : `cam${c.slot}_format`], res: p.tech[`cam${c.slot}_res`] }) : [];
                  const topRows = top.filter((x) => x.score === top[0]?.score).map((x) => x.row);
                  return (
                    <tr key={c.id}>
                      <td>{c.label}{c.note && <div className="muted">{c.note}</div>}</td>
                      <td className="min-w-[220px]">
                        <RatePick rates={p.rates} candidates={topRows} value={c.rateId} label={`Data rate ${c.label}`} onPick={(id) => setCam(c.id, { rateId: id, mbps: undefined })} disabled={ro} />
                        <div className="text-xs">{c.rateId ? <SourceLink r={rateOf(c.rateId)} /> : topRows.length > 1 ? <span className="muted">Beberapa baris cocok, pilih satu.</span> : <span className="muted">Tidak ada baris cocok: isi Mbit/s.</span>}</div>
                      </td>
                      <td className="bg-num"><Num label={`Mbit/s ${c.label}`} value={c.mbps ?? rateOf(c.rateId)?.mbps} onChange={(n) => setCam(c.id, { mbps: n })} w="w-24" /></td>
                      <td className="bg-num"><Num label={`fps ${c.label}`} value={c.fps} onChange={(n) => setCam(c.id, { fps: n || 24 })} w="w-20" /></td>
                      <td className="bg-num"><Num label={`Unit ${c.label}`} value={c.units} step="1" min={1} onChange={(n) => setCam(c.id, { units: Math.max(1, n) })} w="w-16" /></td>
                      <td className="bg-num"><Num label={`Menit per hari ${c.label}`} value={c.minutesPerDay} hint="mis. 60–180" onChange={(n) => setCam(c.id, { minutesPerDay: n })} w="w-24" /></td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          <div className="grid gap-3 text-sm sm:grid-cols-2 lg:grid-cols-3">
            <label className="grid gap-1">Proxy: data rate
              <RatePick rates={p.rates} candidates={stageCands("proxyCodec", "offline_res")} value={calc.proxy.rateId} label="Data rate proxy" onPick={(id) => upd((c) => ({ ...c, proxy: { ...c.proxy, rateId: id, mbps: undefined } }))} disabled={ro} />
              <span className="text-xs"><SourceLink r={rateOf(calc.proxy.rateId)} /></span></label>
            <label className="grid gap-1">Master / online: data rate
              <RatePick rates={p.rates} candidates={stageCands("onlineCodec", "masterResolution")} value={calc.master.rateId} label="Data rate master" onPick={(id) => upd((c) => ({ ...c, master: { ...c.master, rateId: id, mbps: undefined } }))} disabled={ro} />
              <span className="text-xs"><SourceLink r={rateOf(calc.master.rateId)} /></span></label>
            <label className="grid gap-1">Durasi master (menit)<Num label="Durasi master" value={calc.master.runtimeMin} onChange={(n) => upd((c) => ({ ...c, master: { ...c.master, runtimeMin: n } }))} /></label>
            <label className="grid gap-1">Versi master<Num label="Versi master" step="1" value={calc.master.versions} onChange={(n) => upd((c) => ({ ...c, master: { ...c.master, versions: n } }))} /></label>
            <label className="grid gap-1">Grading (% dari OCF)<Num label="Persen grading" value={calc.gradePct} onChange={(n) => upd((c) => ({ ...c, gradePct: n }))} /></label>
            <label className="grid gap-1">VFX (TB)<Num label="VFX TB" value={calc.vfxTb} onChange={(n) => upd((c) => ({ ...c, vfxTb: n }))} /></label>
            <label className="grid gap-1">Overhead % <span className="tag">asumsi</span><Num label="Overhead persen" value={calc.overheadPct} onChange={(n) => upd((c) => ({ ...c, overheadPct: n }))} /></label>
            <label className="grid gap-1">Isi maksimal drive % <span className="tag">asumsi</span><Num label="Isi maksimal persen" value={calc.fillPct} onChange={(n) => upd((c) => ({ ...c, fillPct: n || 80 }))} /></label>
          </div>
          <div className="overflow-x-auto">
            <table className="table w-full text-sm">
              <thead><tr><th className="text-start">Tahap</th><th className="bg-num">Salinan <span className="tag">asumsi</span></th><th className="bg-num">Kapasitas drive (TB)</th><th className="bg-num">Mentah</th><th className="bg-num">Total</th><th className="bg-num">Kapasitas dibutuhkan</th><th className="bg-num">Jumlah drive</th></tr></thead>
              <tbody>
                {need.rows.map((r) => {
                  const copiesKey = { ocf: "ocfCopies", proxy: "proxy", grade: "gradeCopies", vfx: "vfxCopies", master: "master", archive: "archiveCopies" }[r.stage];
                  const setCopies = (n: number) => upd((c) => (r.stage === "proxy" ? { ...c, proxy: { ...c.proxy, copies: n } } : r.stage === "master" ? { ...c, master: { ...c.master, copies: n } } : { ...c, [copiesKey]: n }));
                  return (
                    <tr key={r.stage}>
                      <td>{STAGE_LABEL[r.stage]}</td>
                      <td className="bg-num"><Num label={`Salinan ${r.stage}`} value={r.copies} step="1" onChange={setCopies} w="w-16" /></td>
                      <td className="bg-num"><Num label={`TB per drive ${r.stage}`} value={calc.driveTb[r.stage]} onChange={(n) => upd((c) => ({ ...c, driveTb: { ...c.driveTb, [r.stage]: n || undefined } }))} w="w-20" /></td>
                      <td className="bg-num">{fmtTb(r.raw)} TB</td>
                      <td className="bg-num">{fmtTb(r.total)} TB <span className="muted">≈ {fmtTib(r.total)} TiB</span></td>
                      <td className="bg-num">{fmtTb(r.capacity)} TB <span className="muted">≈ {fmtTib(r.capacity)} TiB</span></td>
                      <td className="bg-num">{r.drives == null ? <span className="muted">isi TB drive</span> : r.drives}</td>
                    </tr>
                  );
                })}
              </tbody>
              <tfoot><tr className="font-medium"><td>Total</td><td /><td /><td /><td className="bg-num">{fmtTb(need.total)} TB</td><td className="bg-num">{fmtTb(need.capacity)} TB</td><td /></tr></tfoot>
            </table>
          </div>
        </fieldset>
        {canEdit && <button type="button" className="btn" disabled={busy || !dirty && !p.seeded} onClick={() => run(() => saveCalc(slug, calc, p.scenarioId ?? undefined), "Kalkulator disimpan.")}>{busy ? "Menyimpan…" : "Simpan kalkulator"}</button>}
      </section>

      <section className="space-y-3">
        <div className="flex flex-wrap items-center gap-2">
          <h2 className="text-base font-semibold">Daftar belanja</h2>
          {canEdit && <button type="button" className="btn-secondary" onClick={() => setLine("new")}>Tambah drive</button>}
        </div>
        {lines.length === 0 ? <p className="muted text-sm">Belum ada drive yang direncanakan. Biaya masuk ke lingkup &quot;Hard drive &amp; storage&quot; di Ringkasan, sebelum pajak.</p> : (
          <div className="overflow-x-auto">
            <table className="table w-full text-sm">
              <thead><tr><th className="text-start">Tujuan</th><th className="text-start">Media</th><th className="bg-num">Kapasitas</th><th className="bg-num">Jumlah</th><th className="bg-num">Harga satuan</th><th className="bg-num">Subtotal</th><th className="text-start">Dibutuhkan sebelum</th><th className="text-start">Status</th><th /></tr></thead>
              <tbody>
                {lines.map((l) => (
                  <tr key={l.id} className={l.status === "cancelled" ? "muted" : ""}>
                    <td>{PURPOSES[l.purpose]}{l.vendor && <span className="muted"> {l.vendor}</span>}</td><td>{MEDIA[l.media]}</td>
                    <td className="bg-num">{(l.capacityGb / 1000).toLocaleString("id-ID")} TB</td><td className="bg-num">{l.qty}</td>
                    <td className="bg-num">{formatRupiah(l.unitPrice)}</td><td className="bg-num">{formatRupiah(lineAmount(l.qty * 1000, l.unitPrice))}</td>
                    <td className="tabular-nums">{l.neededBy ?? "—"}</td><td><span className="tag">{STATUS[l.status]}</span></td>
                    <td className="whitespace-nowrap">{canEdit && <><button type="button" className="btn-ghost" onClick={() => setLine(l)}>Ubah</button><ConfirmButton type="button" className="btn-ghost" message="Hapus baris belanja ini?" onClick={() => run(() => removeDrive(slug, l.id), "Baris dihapus.")}>Hapus</ConfirmButton></>}</td>
                  </tr>
                ))}
              </tbody>
              <tfoot><tr className="font-medium"><td>Total (sebelum pajak)</td><td /><td /><td /><td /><td className="bg-num">{formatRupiah(total)}</td><td colSpan={3} /></tr></tfoot>
            </table>
          </div>
        )}
        <p className="muted text-sm">Drive adalah barang, tidak kena PPh 23. PPN per baris bersifat opsional. {TAX_NOTE}</p>
      </section>

      <section className="space-y-3">
        <h2 className="text-base font-semibold">Kebutuhan vs rencana vs drive-tracker</h2>
        <div className="overflow-x-auto">
          <table className="table w-full text-sm">
            <thead><tr><th className="text-start">Tahap</th><th className="bg-num">Kebutuhan</th><th className="bg-num">Rencana belanja</th><th className="bg-num">Selisih</th></tr></thead>
            <tbody>
              {STAGES.map((s) => {
                const r = need.rows.find((x) => x.stage === s)!;
                const d = planned(s) - r.capacity;
                return <tr key={s}><td>{STAGE_LABEL[s]}</td><td className="bg-num">{fmtTb(r.capacity)} TB</td><td className="bg-num">{fmtTb(planned(s))} TB</td>
                  <td className={`bg-num ${d < -1 ? "text-danger" : ""}`}>{r.capacity === 0 && planned(s) === 0 ? "—" : d < -1 ? `Kurang ${fmtTb(-d)} TB` : `Lebih ${fmtTb(d)} TB`}</td></tr>;
              })}
            </tbody>
          </table>
        </div>
        {p.tracker && (
          <div className="text-sm">
            <h3 className="font-semibold">Drive-tracker</h3>
            {!cmp || cmp.state === "unlinked" ? <p className="muted">Belum terhubung ke drive-tracker.</p> : cmp.state === "unavailable" ? <p className="muted">Belum terhubung: {cmp.reason}</p> : (
              <p>Drive OCF direncanakan {cmp.plannedDrives}, tercatat di drive-tracker {cmp.recordedDrives} (raw + backup). Isi tercatat {(cmp.recordedBytes / 1e12).toLocaleString("id-ID", { maximumFractionDigits: 2 })} TB{cmp.pct != null && <>, {cmp.pct}% dari perkiraan OCF sudah tercatat</>}. Yang dibandingkan isi yang tercatat, bukan sisa ruang.</p>
            )}
          </div>
        )}
      </section>

      {line && <LineDrawer slug={p.slug} scenarioId={p.scenarioId} init={line === "new" ? null : line} vendors={p.vendors} onClose={() => setLine(null)} />}
      {ratesOpen && <RatesDrawer slug={slug} canEdit={canEdit} rates={p.rates} projectIds={p.projectRateIds} onClose={() => setRatesOpen(false)} />}
    </div>
  );
}

function LineDrawer({ slug, scenarioId, init, vendors, onClose }: { slug: string; scenarioId: string | null; init: DriveLineRow | null; vendors: { id: string; name: string }[]; onClose: () => void }) {
  const toast = useToast();
  const router = useRouter();
  const [f, setF] = useState({ purpose: init?.purpose ?? "ocf", media: init?.media ?? "ssd", cap: init ? String(init.capacityGb / 1000).replace(".", ",") : "", qty: String(init?.qty ?? 1), price: init ? String(init.unitPrice) : "", ppn: init?.ppnRateBp != null ? formatRateBp(init.ppnRateBp) : "", vendorId: init?.vendorId ?? "", neededBy: init?.neededBy ?? "", status: init?.status ?? "planned", notes: init?.notes ?? "" });
  const [busy, setBusy] = useState(false);
  let sub: number | null = null;
  try { sub = lineAmount(Math.round(Number(f.qty) || 0) * 1000, f.price.trim() ? parseRupiah(f.price) : 0); } catch { /* shown on save */ }
  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    let unitPrice = 0, ppnBp: number | null = null;
    try { unitPrice = f.price.trim() ? parseRupiah(f.price) : 0; ppnBp = parseRateBp(f.ppn); } catch (x) { toast({ message: x instanceof MoneyError ? x.message : "Data tidak valid.", tone: "error" }); return; }
    const capTb = Number(f.cap.replace(",", "."));
    setBusy(true);
    const r = await saveDrive(slug, init?.id ?? null, { purpose: f.purpose, media: f.media, capacityGb: Math.round(capTb * 1000), qty: Number(f.qty), unitPrice, ppnBp, vendorId: f.vendorId || null, neededBy: f.neededBy, status: f.status, notes: f.notes }, scenarioId ?? undefined);
    setBusy(false);
    if (!r.ok) { toast({ message: r.error, tone: "error" }); return; }
    toast({ message: "Drive disimpan." }); onClose(); router.refresh();
  };
  const sel = (k: "purpose" | "media" | "status", o: Record<string, string>, label: string) => <label className="grid gap-1">{label}<select value={f[k]} onChange={(e) => setF({ ...f, [k]: e.target.value })}>{Object.entries(o).map(([v, l]) => <option key={v} value={v}>{l}</option>)}</select></label>;
  return (
    <Drawer title={init ? "Ubah drive" : "Tambah drive"} crumb="Hard drive" onClose={onClose}>
      <form onSubmit={submit} className="space-y-4 text-sm">
        {sel("purpose", PURPOSES, "Tujuan")}{sel("media", MEDIA, "Media")}
        <label className="grid gap-1">Kapasitas per drive (TB desimal)<input inputMode="decimal" required placeholder="8" value={f.cap} onChange={(e) => setF({ ...f, cap: e.target.value })} /></label>
        <label className="grid gap-1">Jumlah<input inputMode="numeric" required value={f.qty} onChange={(e) => setF({ ...f, qty: e.target.value })} /></label>
        <label className="grid gap-1">Harga satuan, sebelum pajak (Rp)<input inputMode="numeric" placeholder="3.500.000" value={f.price} onChange={(e) => setF({ ...f, price: e.target.value })} /></label>
        <p className="num">Subtotal {sub == null ? "—" : formatRupiah(sub)}</p>
        <label className="grid gap-1">PPN % (opsional, perkiraan; kosong = tidak dihitung, umumnya {formatRateBp(DEFAULT_PPN_BP)})<input inputMode="decimal" value={f.ppn} onChange={(e) => setF({ ...f, ppn: e.target.value })} /></label>
        <label className="grid gap-1">Vendor<select value={f.vendorId} onChange={(e) => setF({ ...f, vendorId: e.target.value })}><option value="">Belum dipilih</option>{vendors.map((v) => <option key={v.id} value={v.id}>{v.name}</option>)}</select></label>
        <label className="grid gap-1">Dibutuhkan sebelum<input type="date" value={f.neededBy} onChange={(e) => setF({ ...f, neededBy: e.target.value })} /></label>
        {sel("status", STATUS, "Status")}
        <label className="grid gap-1">Catatan<textarea rows={2} maxLength={500} value={f.notes} onChange={(e) => setF({ ...f, notes: e.target.value })} /></label>
        <button className="btn" disabled={busy}>{busy ? "Menyimpan…" : "Simpan"}</button>
      </form>
    </Drawer>
  );
}

const csv = (s: string) => s.split(",").map((x) => x.trim()).filter(Boolean);
function RatesDrawer({ slug, canEdit, rates, projectIds, onClose }: { slug: string; canEdit: boolean; rates: RateRow[]; projectIds: string[]; onClose: () => void }) {
  const toast = useToast();
  const router = useRouter();
  const [own, setOwn] = useState<RateRow[]>(() => rates.filter((r) => projectIds.includes(r.id)));
  const [edit, setEdit] = useState<{ id: string; label: string; models: string; formats: string; res: string; refFps: string; mbps: string; note: string } | null>(null);
  const [busy, setBusy] = useState(false);
  const save = async (next: RateRow[]) => {
    setBusy(true);
    const r = await saveRateTable(slug, next);
    setBusy(false);
    if (!r.ok) { toast({ message: r.error, tone: "error" }); return; }
    setOwn(next); setEdit(null); toast({ message: "Tabel data rate proyek disimpan." }); router.refresh();
  };
  const begin = (r: RateRow | null) => setEdit(r ? { id: r.id, label: r.label, models: r.models.join(", "), formats: r.formats.join(", "), res: r.res.join(", "), refFps: String(r.refFps), mbps: String(r.mbps), note: r.note ?? "" } : { id: `p-${Math.random().toString(36).slice(2, 8)}`, label: "", models: "", formats: "", res: "", refFps: "24", mbps: "", note: "" });
  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!edit) return;
    const row: RateRow = { id: edit.id, maker: rates.find((r) => r.id === edit.id)?.maker ?? "Proyek", label: edit.label, models: csv(edit.models).map(norm), formats: csv(edit.formats).map(norm), res: csv(edit.res).map(norm), refFps: Number(edit.refFps), mbps: Number(edit.mbps), source: null, note: edit.note || undefined };
    save([...own.filter((x) => x.id !== row.id), row]);
  };
  const merged = rates.map((r) => ({ r, mine: own.find((o) => o.id === r.id) })).map(({ r, mine }) => mine ?? r);
  return (
    <Drawer title="Tabel data rate" crumb="Hard drive" onClose={onClose}>
      <div className="space-y-4 text-sm">
        <p className="muted">Mbit/s desimal pada fps acuan. Baris bawaan selalu berisi tautan sumber dari pabrikan. Perubahan proyek menimpa baris bawaan hanya untuk proyek ini.</p>
        {canEdit && !edit && <button type="button" className="btn-secondary" onClick={() => begin(null)}>Tambah baris</button>}
        {edit && (
          <form onSubmit={submit} className="space-y-3">
            <label className="grid gap-1">Nama<input required value={edit.label} onChange={(e) => setEdit({ ...edit, label: e.target.value })} /></label>
            <label className="grid gap-1">Model kamera (pisah koma; kosong = codec saja)<input value={edit.models} onChange={(e) => setEdit({ ...edit, models: e.target.value })} /></label>
            <label className="grid gap-1">Format / codec (pisah koma)<input required value={edit.formats} onChange={(e) => setEdit({ ...edit, formats: e.target.value })} /></label>
            <label className="grid gap-1">Resolusi (pisah koma)<input value={edit.res} onChange={(e) => setEdit({ ...edit, res: e.target.value })} /></label>
            <label className="grid gap-1">Mbit/s<input inputMode="decimal" required value={edit.mbps} onChange={(e) => setEdit({ ...edit, mbps: e.target.value })} /></label>
            <label className="grid gap-1">fps acuan<input inputMode="decimal" required value={edit.refFps} onChange={(e) => setEdit({ ...edit, refFps: e.target.value })} /></label>
            <label className="grid gap-1">Catatan<input value={edit.note} onChange={(e) => setEdit({ ...edit, note: e.target.value })} /></label>
            <div className="flex gap-2"><button className="btn" disabled={busy}>Simpan</button><button type="button" className="btn-ghost" onClick={() => setEdit(null)}>Batal</button></div>
          </form>
        )}
        <div className="overflow-x-auto">
          <table className="table w-full">
            <thead><tr><th className="text-start">Baris</th><th className="bg-num">Mbit/s</th><th className="bg-num">fps</th><th className="text-start">Sumber</th><th /></tr></thead>
            <tbody>
              {merged.map((r) => {
                const mine = own.some((o) => o.id === r.id);
                return (
                  <tr key={r.id}>
                    <td>{r.maker} {r.label} {mine && <span className="tag">proyek</span>}{r.note && <div className="muted">{r.note}</div>}</td>
                    <td className="bg-num">{r.mbps}</td><td className="bg-num">{r.refFps}</td>
                    <td>{r.source ? <a href={r.source.url} target="_blank" rel="noreferrer noopener" className="underline">{r.source.title}</a> : "—"}</td>
                    <td className="whitespace-nowrap">{canEdit && <><button type="button" className="btn-ghost" onClick={() => begin(r)}>Ubah</button>{mine && <button type="button" className="btn-ghost" disabled={busy} onClick={() => save(own.filter((o) => o.id !== r.id))}>{r.id.startsWith("p-") ? "Hapus" : "Kembalikan"}</button>}</>}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>
    </Drawer>
  );
}
