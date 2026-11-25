"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { editScenario, newScenario, removeScenario, setScenarioPick, switchScenario } from "@/app/admin/budget-actions";
import { ConfirmButton, Drawer } from "@/components/ui/controls";
import { useToast } from "@/components/ui/toast";
import { fmt, formatRupiah } from "@/lib/budget/money";
import type { Comparison } from "@/lib/budget/scenarios";

export type ScenarioInfo = { id: string; name: string; notes: string; isActive: boolean; pickCount: number; driveLineCount: number };
export type PickScope = { id: string; name: string; bids: { id: string; vendor: string; versions: { id: string; number: number; status: string }[] }[] };
type Drw = { kind: "new"; from: string } | { kind: "rename"; id: string } | { kind: "pick"; scenarioId: string; scopeId: string } | null;

const danger = (n: number) => (n < 0 ? "text-danger" : "");
const signed = (n: number) => (n > 0 ? `+${fmt(n)}` : fmt(n));

export function ScenarioTab({ slug, canEdit, scenarios, cmp, scopes, live }: { slug: string; canEdit: boolean; scenarios: ScenarioInfo[]; cmp: Comparison; scopes: PickScope[]; live: { invoiced: number; paid: number } }) {
  const toast = useToast();
  const router = useRouter();
  const [drawer, setDrawer] = useState<Drw>(null);
  const [pend, setPend] = useState<string | null>(null);
  const active = scenarios.find((s) => s.isActive);
  const latest = [...scenarios].reverse().find((s) => !s.isActive);
  const [sel, setSel] = useState<string[]>(() => [active?.id, latest?.id].filter((x): x is string => !!x));
  const shown = sel.map((id) => cmp.scenarios.find((s) => s.id === id)).filter((s) => !!s);
  const byId = (id: string) => cmp.scenarios.find((s) => s.id === id);
  const toggle = (id: string) => setSel((x) => (x.includes(id) ? x.filter((i) => i !== id) : x.length >= 4 ? x : [...x, id]));
  const act = async (fn: () => Promise<{ ok: true } | { ok: false; error: string }>, ok: string) => {
    const r = await fn();
    if (!r.ok) { toast({ message: r.error, tone: "error" }); return false; }
    toast({ message: ok });
    router.refresh();
    return true;
  };
  const totalBudget = cmp.scenarios[0]?.total.budget ?? 0;

  return (
    <div className="space-y-5">
      <div className="space-y-2">
        <div className="flex flex-wrap items-center gap-3">
          <h2 className="text-base font-medium">Rencana</h2>
          {canEdit && <button type="button" className="btn-secondary" onClick={() => setDrawer({ kind: "new", from: "" })}>Rencana baru</button>}
        </div>
        <p className="muted text-sm">Rencana menyimpan vendor dan versi penawaran yang dipilih per lingkup, ditambah rencana hard drive. Rencana aktif dipakai di Ringkasan.</p>
        <div className="overflow-x-auto">
          <table className="table w-full text-sm">
            <thead><tr><th className="text-start">Bandingkan</th><th className="text-start">Rencana</th><th className="bg-num">Dipilih sebelum pajak (Rp)</th><th className="bg-num">Selisih vs budget (Rp)</th><th /></tr></thead>
            <tbody>
              {scenarios.map((s) => {
                const v = byId(s.id);
                return (
                  <tr key={s.id}>
                    <td><input type="checkbox" aria-label={`Bandingkan ${s.name}`} checked={sel.includes(s.id)} disabled={!sel.includes(s.id) && sel.length >= 4} onChange={() => toggle(s.id)} /></td>
                    <td><span className="font-medium">{s.name}</span> {s.isActive && <span className="tag tag-ok">Aktif</span>}<div className="muted">{s.notes || `${s.pickCount} pilihan vendor, ${s.driveLineCount} belanja drive`}</div></td>
                    <td className="bg-num">{v ? <>{fmt(v.total.chosen)} {v.total.provisional && <span className="tag tag-warn">perkiraan</span>}</> : "—"}</td>
                    <td className={`bg-num ${v ? danger(v.vsBudget) : ""}`}>{v ? fmt(v.vsBudget) : "—"}</td>
                    <td className="whitespace-nowrap">
                      {canEdit && (
                        <span className="inline-flex flex-wrap gap-1">
                          {!s.isActive && <button type="button" className="btn-secondary" disabled={!!pend} onClick={async () => { setPend(s.id); await act(() => switchScenario(slug, s.id), `Rencana "${s.name}" aktif.`); setPend(null); }}>{pend === s.id ? "Menyimpan…" : "Aktifkan"}</button>}
                          <button type="button" className="btn-ghost" onClick={() => setDrawer({ kind: "new", from: s.id })}>Salin</button>
                          <button type="button" className="btn-ghost" onClick={() => setDrawer({ kind: "rename", id: s.id })}>Ganti nama</button>
                          <ConfirmButton className="btn-danger" pendingLabel="Menyimpan…" message={`Hapus rencana "${s.name}" beserta pilihan dan belanja drive di dalamnya? Tagihan dan pembayaran tidak terpengaruh.`} disabled={s.isActive} title={s.isActive ? "Rencana aktif tidak bisa dihapus. Aktifkan rencana lain dulu." : undefined} onClick={() => { void act(() => removeScenario(slug, s.id), "Rencana dihapus."); }}>Hapus</ConfirmButton>
                        </span>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      <div className="space-y-2">
        <h2 className="text-base font-medium">Perbandingan</h2>
        {shown.length < 2 ? <p className="muted text-sm">Centang 2 sampai 4 rencana di atas untuk membandingkan.</p> : (
          <>
            <div className="overflow-x-auto">
              <table className="table sc-cmp w-full text-sm">
                <thead><tr><th className="text-start">Lingkup</th><th className="bg-num">Budget (Rp)</th>{shown.map((s) => <th key={s.id} className="text-start">{s.name} {s.isActive && <span className="tag tag-ok">Aktif</span>}</th>)}</tr></thead>
                <tbody>
                  {cmp.scopes.map((sc) => (
                    <tr key={sc.id}>
                      <td>{sc.name}</td>
                      <td className="bg-num">{fmt(sc.budget)}</td>
                      {shown.map((s) => {
                        const c = s.cells[sc.id];
                        return (
                          <td key={s.id}>
                            <div className="sc-cell">
                              {c?.vendor ? <><span className="font-medium">{c.vendor}</span><span className="muted">{c.label}</span>{c.stale && <span className="tag tag-warn">versi sudah digantikan</span>}<span className="bg-num">{fmt(c.amount)}</span></> : <span className="muted">Belum dipilih</span>}
                              {canEdit && <button type="button" className="btn-ghost" onClick={() => setDrawer({ kind: "pick", scenarioId: s.id, scopeId: sc.id })}>Pilih</button>}
                            </div>
                          </td>
                        );
                      })}
                    </tr>
                  ))}
                  <tr>
                    <td>Hard drive</td><td className="bg-num muted">—</td>
                    {shown.map((s) => <td key={s.id} className="bg-num">{fmt(s.drives)}</td>)}
                  </tr>
                </tbody>
                <tfoot>
                  <tr className="font-medium"><td>Total dipilih</td><td className="bg-num">{fmt(totalBudget)}</td>{shown.map((s) => <td key={s.id} className="bg-num">{fmt(s.total.chosen)} {s.total.provisional && <span className="tag tag-warn">perkiraan</span>}</td>)}</tr>
                  <tr><td>Selisih vs budget</td><td />{shown.map((s) => <td key={s.id} className={`bg-num ${danger(s.vsBudget)}`}>{fmt(s.vsBudget)}</td>)}</tr>
                  <tr><td>Selisih vs {shown[0].name}</td><td />{shown.map((s, i) => <td key={s.id} className="bg-num">{i === 0 ? "—" : signed(s.diffFirst)}</td>)}</tr>
                </tfoot>
              </table>
            </div>
            <p className="muted text-sm">Semua angka sebelum pajak. Tagihan dan pembayaran adalah data nyata dan sama di semua rencana.</p>
            <p className="text-sm">Ditagih <span className="tabular-nums">{formatRupiah(live.invoiced)}</span>, dibayar <span className="tabular-nums">{formatRupiah(live.paid)}</span> (sebelum pajak).</p>
          </>
        )}
      </div>

      {drawer?.kind === "new" && <NameDrawer slug={slug} scenarios={scenarios} from={drawer.from} onClose={() => setDrawer(null)} act={act} />}
      {drawer?.kind === "rename" && <RenameDrawer slug={slug} s={scenarios.find((x) => x.id === drawer.id)!} onClose={() => setDrawer(null)} act={act} />}
      {drawer?.kind === "pick" && <PickDrawer slug={slug} scenario={cmp.scenarios.find((x) => x.id === drawer.scenarioId)!} scope={scopes.find((x) => x.id === drawer.scopeId)!} onClose={() => setDrawer(null)} act={act} />}
    </div>
  );
}

type Act = (fn: () => Promise<{ ok: true } | { ok: false; error: string }>, ok: string) => Promise<boolean>;

function NameDrawer({ slug, scenarios, from, onClose, act }: { slug: string; scenarios: ScenarioInfo[]; from: string; onClose: () => void; act: Act }) {
  const [name, setName] = useState("");
  const [src, setSrc] = useState(from);
  const [busy, setBusy] = useState(false);
  return (
    <Drawer title="Rencana baru" crumb="Anggaran & vendor" onClose={onClose}>
      <form className="space-y-4 text-sm" onSubmit={async (e) => { e.preventDefault(); setBusy(true); const ok = await act(() => newScenario(slug, name, src || null), "Rencana dibuat."); setBusy(false); if (ok) onClose(); }}>
        <label className="grid gap-1">Nama rencana<input value={name} maxLength={80} required placeholder="Rencana B" onChange={(e) => setName(e.target.value)} /></label>
        <label className="grid gap-1">Mulai dari
          <select value={src} onChange={(e) => setSrc(e.target.value)}>
            <option value="">Kosong (tanpa pilihan vendor dan drive)</option>
            {scenarios.map((s) => <option key={s.id} value={s.id}>Salin dari {s.name}</option>)}
          </select>
        </label>
        <p className="muted">Salinan memuat pilihan vendor, kalkulator, dan belanja drive; mengubahnya tidak mengubah rencana asal. Rencana baru tidak langsung aktif.</p>
        <button className="btn" disabled={busy || !name.trim()}>{busy ? "Menyimpan…" : "Buat rencana"}</button>
      </form>
    </Drawer>
  );
}

function RenameDrawer({ slug, s, onClose, act }: { slug: string; s: ScenarioInfo; onClose: () => void; act: Act }) {
  const [name, setName] = useState(s.name);
  const [notes, setNotes] = useState(s.notes);
  const [busy, setBusy] = useState(false);
  return (
    <Drawer title="Ganti nama rencana" crumb="Anggaran & vendor" onClose={onClose}>
      <form className="space-y-4 text-sm" onSubmit={async (e) => { e.preventDefault(); setBusy(true); const ok = await act(() => editScenario(slug, s.id, name, notes), "Rencana disimpan."); setBusy(false); if (ok) onClose(); }}>
        <label className="grid gap-1">Nama rencana<input value={name} maxLength={80} required onChange={(e) => setName(e.target.value)} /></label>
        <label className="grid gap-1">Catatan<textarea rows={3} maxLength={500} value={notes} onChange={(e) => setNotes(e.target.value)} /></label>
        <button className="btn" disabled={busy || !name.trim()}>{busy ? "Menyimpan…" : "Simpan"}</button>
      </form>
    </Drawer>
  );
}

function PickDrawer({ slug, scenario, scope, onClose, act }: { slug: string; scenario: Comparison["scenarios"][number]; scope: PickScope; onClose: () => void; act: Act }) {
  const cur = scenario.cells[scope.id];
  const [bidId, setBidId] = useState(cur?.bidId ?? "");
  const [pin, setPin] = useState(cur?.versionId ?? "");
  const [busy, setBusy] = useState(false);
  const bid = scope.bids.find((b) => b.id === bidId);
  const save = async (b: string | null, v: string | null) => { setBusy(true); const ok = await act(() => setScenarioPick(slug, scenario.id, scope.id, b, v), b ? "Pilihan disimpan." : "Pilihan dibatalkan."); setBusy(false); if (ok) onClose(); };
  return (
    <Drawer title={`Pilih vendor: ${scope.name}`} crumb={`Rencana ${scenario.name}`} onClose={onClose}>
      <form className="space-y-4 text-sm" onSubmit={(e) => { e.preventDefault(); void save(bidId || null, bidId && pin ? pin : null); }}>
        {scope.bids.length === 0 ? <p className="muted">Belum ada vendor di lingkup ini. Tambahkan dulu dari halaman lingkup.</p> : (
          <>
            <label className="grid gap-1">Vendor
              <select value={bidId} onChange={(e) => { setBidId(e.target.value); setPin(""); }}>
                <option value="">Belum dipilih</option>
                {scope.bids.map((b) => <option key={b.id} value={b.id}>{b.vendor}</option>)}
              </select>
            </label>
            {bid && (
              <label className="grid gap-1">Versi penawaran
                <select value={pin} onChange={(e) => setPin(e.target.value)}>
                  <option value="">Ikuti persetujuan</option>
                  {bid.versions.map((v) => <option key={v.id} value={v.id}>Kunci versi {v.number} ({v.status === "approved" ? "disetujui" : v.status === "superseded" ? "digantikan" : v.status === "rejected" ? "ditolak" : "belum disetujui"})</option>)}
                </select>
              </label>
            )}
            {cur?.stale && <p><span className="tag tag-warn">versi sudah digantikan</span> Versi yang dikunci tidak lagi berlaku. Pilih versi lain atau ikuti persetujuan.</p>}
            <p className="muted">Ikuti persetujuan memakai versi yang sedang disetujui. Kunci versi menahan angka pada versi itu walau ada versi baru.</p>
            <div className="flex gap-2">
              <button className="btn" disabled={busy}>{busy ? "Menyimpan…" : "Simpan"}</button>
              {cur?.bidId && <button type="button" className="btn-ghost" disabled={busy} onClick={() => void save(null, null)}>Batalkan pilihan</button>}
            </div>
          </>
        )}
      </form>
    </Drawer>
  );
}
