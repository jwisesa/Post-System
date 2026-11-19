"use client";

import { useState, useTransition } from "react";
import { applyTemplateAction, deleteTemplateAction, previewTemplateAction, renameTemplateAction } from "@/app/admin/template-actions";
import type { PlanPhase } from "@/lib/schedule/backward";
import { fmtDate, fmtRange } from "@/lib/schedule/dates";
import type { TemplateRow, TemplateSource } from "@/lib/schedule/template-service";
import { TRACK_TEMPLATES } from "@/lib/schedule/templates";
import { ConfirmButton } from "../ui/controls";
import { useToast } from "../ui/toast";

type Preview = Extract<Awaited<ReturnType<typeof previewTemplateAction>>, { ok: true }>["preview"];

const toSource = (v: string): TemplateSource => (v.startsWith("s:") ? { kind: "saved", id: v.slice(2) } : { kind: "builtin", value: v.slice(2) });

/** Plans a template backward from a release date: preview first, nothing is written until "Terapkan". */
export function TemplatePanel({ slug, templates, onBack }: { slug: string; templates: TemplateRow[]; onBack?: () => void }) {
  const toast = useToast();
  const [pending, start] = useTransition();
  const [source, setSource] = useState("");
  const [release, setRelease] = useState("");
  const [preview, setPreview] = useState<Preview | null>(null);
  const [pick, setPick] = useState<"suggest" | "none">("suggest");
  const [createGroups, setCreateGroups] = useState(true);
  const [error, setError] = useState("");
  const reset = () => { setPreview(null); setError(""); };

  const run = () => start(async () => {
    setError("");
    const r = await previewTemplateAction(slug, toSource(source), release);
    if (!r.ok) { setPreview(null); return setError(r.error); }
    setPreview(r.preview);
    setPick("suggest");
  });
  const [applying, setApplying] = useState(false);
  const apply = async () => {
    if (applying) return;
    setApplying(true);
    try {
      const r = await applyTemplateAction(slug, toSource(source), release, usingSuggestion, createGroups);
      if (!r.ok) return setError(r.error);
      toast({ message: `Template diterapkan (${r.phases} fase).` });
      reset();
    } finally { setApplying(false); }
  };

  const sug = preview?.plan.suggestion;
  const usingSuggestion = !!sug?.fits && pick === "suggest";
  const shown: PlanPhase[] = preview ? (usingSuggestion ? sug!.phases : preview.plan.phases) : [];
  const missing = preview?.groups.filter((g) => !g.found) ?? [];

  return (
    <div className="space-y-6">
      {onBack && <button type="button" className="btn-ghost -ms-2" onClick={onBack}>Kembali ke Kelola</button>}
      <section className="space-y-3">
        <p className="muted text-sm">Pilih template dan tanggal rilis. Fase dihitung mundur dari tanggal rilis pada hari kerja. Tidak ada yang tersimpan sebelum Anda menekan Terapkan.</p>
        <label>
          <span>Template</span>
          <select value={source} onChange={(e) => { setSource(e.target.value); reset(); }}>
            <option value="" disabled>Pilih template…</option>
            <optgroup label="Bawaan">{TRACK_TEMPLATES.filter((t) => t.phases.length).map((t) => <option key={t.value} value={`b:${t.value}`}>{t.label}</option>)}</optgroup>
            {templates.length > 0 && <optgroup label="Template saya">{templates.map((t) => <option key={t.id} value={`s:${t.id}`}>{t.name} ({t.phases} fase)</option>)}</optgroup>}
          </select>
        </label>
        <label><span>Tanggal rilis</span><input type="date" required value={release} onChange={(e) => { setRelease(e.target.value); reset(); }} /></label>
        <button type="button" className="btn-secondary" disabled={!source || !release || pending} onClick={run}>Pratinjau</button>
        {error && <p role="alert" className="text-sm text-danger">{error}</p>}
      </section>

      {preview && (
        <section className="space-y-3 hairline pt-4">
          <h3>Pratinjau · rilis {fmtDate(preview.plan.release)}</h3>
          {preview.existingItems > 0 && <p className="muted text-sm">Project sudah punya {preview.existingItems} item; template menambah track baru, item lama tidak diubah.</p>}
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm tabular-nums">
              <thead><tr className="muted text-xs"><th className="py-1 pr-2">Track</th><th className="pr-2">Fase</th><th className="pr-2">Mulai–Selesai</th><th className="pr-2">hk</th><th>Kurang</th></tr></thead>
              <tbody className="rows">
                {shown.map((p, i) => {
                  const old = preview.plan.phases[i];
                  return (
                    <tr key={p.key}>
                      <td className="py-1 pr-2">{preview.trackNames[p.track]}</td>
                      <td className="pr-2">{p.name}{p.hard && <span className="tag ml-1">Hard</span>}</td>
                      <td className="pr-2">{fmtRange(p.start, p.due)}</td>
                      <td className="pr-2">{usingSuggestion && old.days !== p.days ? `${old.days} → ${p.days}` : p.days}</td>
                      <td className={p.shortfall ? "text-danger" : "muted"}>{p.shortfall || "—"}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          {!preview.plan.fits && sug?.fits && (
            <div className="space-y-2 text-sm">
              <p>Jadwal tidak muat: ada fase yang seharusnya sudah mulai. Saran: padatkan fase yang terlambat dan yang menunggunya hingga {Math.round(sug.factor * 100)}% dari durasi (fase hard tidak diubah).</p>
              <div role="group" aria-label="Pemadatan" className="seg">
                <button type="button" aria-pressed={pick === "suggest"} onClick={() => setPick("suggest")}>Pakai saran</button>
                <button type="button" aria-pressed={pick === "none"} onClick={() => setPick("none")}>Tanpa pemadatan</button>
              </div>
            </div>
          )}
          {!preview.plan.fits && sug && !sug.fits && sug.minRelease && (
            <p className="text-sm text-danger">Pemadatan saja tidak cukup. Mundurkan rilis ke {fmtDate(sug.minRelease)}.</p>
          )}

          {missing.length > 0 && (
            <div className="space-y-1 text-sm">
              <p className="muted">Departemen belum ada di project: {missing.map((g) => g.name).join(", ")}.</p>
              <label className="check"><input type="checkbox" checked={createGroups} onChange={(e) => setCreateGroups(e.target.checked)} /> Buat departemen yang belum ada</label>
            </div>
          )}

          <form action={apply}>
            <ConfirmButton className="btn" disabled={pending || applying} message={`Terapkan template pada rilis ${fmtDate(preview.plan.release)}? Track baru ditambahkan; keadaan sekarang disimpan dulu sebagai versi.`}>Terapkan</ConfirmButton>
          </form>
        </section>
      )}

      <section className="space-y-2 hairline pt-4">
        <h3>Template saya</h3>
        {templates.length === 0 ? <p className="muted text-sm">Belum ada. Simpan track yang ada dari Kelola, bagian Simpan sebagai template.</p> : (
          <ul className="rows text-sm">
            {templates.map((t) => (
              <li key={t.id} className="flex items-center gap-2 py-1.5">
                <span className="min-w-0 flex-1"><span className="block truncate font-medium">{t.name}</span><span className="muted block text-xs">{t.tracks} track · {t.phases} fase</span></span>
                <button type="button" className="btn-ghost" disabled={pending} onClick={() => { const n = window.prompt("Nama template", t.name); if (n && n.trim() !== t.name) start(async () => { const r = await renameTemplateAction(slug, t.id, n); if (!r.ok) toast({ message: r.error, tone: "error" }); }); }}>Ubah nama</button>
                <form action={async () => { const r = await deleteTemplateAction(slug, t.id); if (!r.ok) toast({ message: r.error, tone: "error" }); }}>
                  <ConfirmButton disabled={pending} message={`Hapus template "${t.name}"?`}>Hapus</ConfirmButton>
                </form>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
