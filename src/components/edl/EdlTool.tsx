"use client";

import { useMemo, useState } from "react";
import { saveShots } from "@/app/admin/shot-actions";
import { Icon } from "@/components/ui/icons";
import { pullListRows, shotInputs, toEdl, shotName, tcToFrames, vfxBreakdownRows, type Edl } from "@/lib/edl/edl";
import { parseTimeline } from "@/lib/edl/xml";
import { toCsv } from "@/lib/schedule/csv";
import { useToast } from "../ui/toast";

export function download(name: string, text: string, type = "text/plain") {
  const a = document.createElement("a");
  a.href = URL.createObjectURL(new Blob([text], { type: `${type};charset=utf-8` }));
  a.download = name;
  a.click();
  URL.revokeObjectURL(a.href);
}

export const csv = (name: string, rows: string[][]) => download(name, "\uFEFF" + toCsv(rows), "text/csv");

export function EdlTool({ slug, techFps, canSave }: { slug: string; techFps: string; canSave: boolean }) {
  const toast = useToast();
  const [saving, setSaving] = useState(false);
  const [file, setFile] = useState("");
  const [edl, setEdl] = useState<Edl | null>(null);
  const [error, setError] = useState("");
  const [picked, setPicked] = useState<Set<number>>(new Set());
  const [fps, setFps] = useState(techFps || "24");
  const [handles, setHandles] = useState(8);
  const [pattern, setPattern] = useState("");
  const [start, setStart] = useState(10);
  const [step, setStep] = useState(10);

  async function load(f: File | undefined) {
    if (!f) return;
    let next: Edl;
    try { next = parseTimeline(await f.text()); setError(""); }
    catch (e) { setEdl(null); setError(e instanceof Error ? e.message : "File tidak bisa dibaca."); return; }
    if (next.fps) setFps(next.fps);
    setFile(f.name.replace(/\.[^.]+$/, ""));
    setEdl(next);
    // Start with the events that carry a marker (the usual VFX flag); all of them if none do.
    const marked = next.events.flatMap((e, i) => (e.locator ? [i] : []));
    setPicked(new Set(marked.length ? marked : next.events.map((_, i) => i)));
  }

  const rate = Number(fps) || 24;
  const events = useMemo(() => (edl ? edl.events.filter((_, i) => picked.has(i)) : []), [edl, picked]);
  const opts = { fps: rate, handles, pattern, start, step };
  const order = new Map([...picked].sort((a, b) => a - b).map((i, n) => [i, n]));
  const toggle = (i: number) => setPicked((p) => { const n = new Set(p); if (!n.delete(i)) n.add(i); return n; });
  const all = edl ? edl.events.map((_, i) => i) : [];

  async function save() {
    setSaving(true);
    const r = await saveShots(slug, shotInputs(events, opts));
    setSaving(false);
    if (!r.ok) return toast({ message: r.error, tone: "error" });
    toast({ message: `Shot tracker: ${r.added} baru, ${r.updated} diperbarui${r.unnamed ? `, ${r.unnamed} tanpa nama dilewati` : ""}.` });
  }

  return (
    <div className="space-y-6">
      <div
        className="flex max-w-xl flex-wrap items-center gap-3 rounded-lg border border-dashed border-line-strong bg-raised p-4"
        onDragOver={(e) => e.preventDefault()}
        onDrop={(e) => { e.preventDefault(); load(e.dataTransfer.files?.[0]); }}
      >
        <label className="btn-secondary cursor-pointer has-[:focus-visible]:outline-2">
          <input type="file" className="sr-only" accept=".edl,.xml,.fcpxml,.txt" onChange={(e) => load(e.target.files?.[0])} />
          Pilih file EDL
        </label>
        <span className="text-[13px] text-ink-2">atau seret file ke sini: EDL (CMX3600), FCP7 XML, FCPXML. Dibaca di browser, tidak diunggah.</span>
      </div>

      {error && <p className="tag tag-danger">{error}</p>}
      {edl && edl.events.length === 0 && <p className="tag tag-warn">Tidak ada event video yang terbaca dari file ini.</p>}

      {edl && edl.events.length > 0 && (
        <>
          <div className="flex flex-wrap items-end gap-3">
            <label className="field w-24"><span className="field-label">Frame rate</span><input value={fps} inputMode="decimal" onChange={(e) => setFps(e.target.value)} /></label>
            <label className="field w-24"><span className="field-label">Handles (fr)</span><input type="number" min={0} value={handles} onChange={(e) => setHandles(Math.max(0, Number(e.target.value)))} /></label>
            <label className="field w-56"><span className="field-label">Pola nama shot</span><input value={pattern} placeholder="PRJ_SC012_SH####" onChange={(e) => setPattern(e.target.value)} /></label>
            <label className="field w-20"><span className="field-label">Mulai</span><input type="number" value={start} onChange={(e) => setStart(Number(e.target.value))} /></label>
            <label className="field w-20"><span className="field-label">Langkah</span><input type="number" min={1} value={step} onChange={(e) => setStep(Number(e.target.value))} /></label>
          </div>
          <p className="field-hint">Tanpa pola (#### = nomor urut), nama shot diambil dari marker/locator tiap event.</p>

          {edl.maxFrame >= Math.round(rate) && <p className="tag tag-warn">EDL berisi frame :{edl.maxFrame}, tidak mungkin di {fps} fps. Periksa frame rate.</p>}
          {techFps && techFps !== fps && <p className="tag tag-warn">Frame rate berbeda dari Technical Page ({techFps}).</p>}
          {edl.dropFrame && <p className="tag tag-warn">EDL ini drop-frame; Pull In/Out dan durasi dihitung non-drop dan bisa meleset.</p>}

          <div className="flex flex-wrap items-center gap-2">
            <span className="text-sm"><b>{events.length}</b> dari {edl.events.length} event dipilih{edl.title && <span className="muted"> · {edl.title}</span>}</span>
            <button type="button" className="btn-ghost" onClick={() => setPicked(new Set(all))}>Semua</button>
            <button type="button" className="btn-ghost" onClick={() => setPicked(new Set(all.filter((i) => edl.events[i].locator)))}>Hanya bermarker</button>
            <button type="button" className="btn-ghost" onClick={() => setPicked(new Set())}>Kosongkan</button>
            <span className="grow" />
            <button type="button" className="btn" disabled={!events.length} onClick={() => csv(`${file}_PullList.csv`, pullListRows(events, opts))}><Icon name="download" />Pull List CSV</button>
            <button type="button" className="btn-secondary" disabled={!events.length} onClick={() => csv(`${file}_VFXBreakdown.csv`, vfxBreakdownRows(events, opts))}><Icon name="download" />VFX Breakdown CSV</button>
            <button type="button" className="btn-secondary" disabled={!events.length} title={handles ? "Source diperlebar handles; record disusun berurutan dari 01:00:00:00" : "Record timecode dipertahankan"} onClick={() => download(`${file}_${handles ? "Pull" : "Shots"}.edl`, toEdl(edl.title || file, events, { ...opts, dropFrame: edl.dropFrame }))}><Icon name="download" />EDL</button>
            {canSave && <button type="button" className="btn-secondary" disabled={!events.length || saving} onClick={save}><Icon name="plus" />Simpan ke shot tracker</button>}
          </div>

          <div className="overflow-x-auto">
            <table className="table text-sm tabular-nums">
              <thead><tr className="text-xs">{["", "#", "Shot", "Reel", "Clip", "Trk", "Src In", "Src Out", "Rec In", "Rec Out", "Dur", "Retime", "Marker"].map((h, i) => <th key={i} className="px-2 py-1 text-start font-medium whitespace-nowrap">{h}</th>)}</tr></thead>
              <tbody>
                {edl.events.map((e, i) => {
                  const on = picked.has(i);
                  const shot = on && pattern.includes("#") ? shotName(pattern, order.get(i) ?? 0, start, step) : e.locator;
                  return (
                    <tr key={i} className={`hoverable ${on ? "" : "muted"}`}>
                      <td className="px-2 py-1"><input type="checkbox" checked={on} onChange={() => toggle(i)} aria-label={`Pilih event ${e.num}`} /></td>
                      {[e.num, shot, e.reel, e.clipName, e.track, e.srcIn, e.srcOut, e.recIn, e.recOut, String(tcToFrames(e.srcOut, rate) - tcToFrames(e.srcIn, rate)), e.retime, e.locatorColor].map((v, c) => <td key={c} className="px-2 py-1 whitespace-nowrap">{v}</td>)}
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </>
      )}
    </div>
  );
}
