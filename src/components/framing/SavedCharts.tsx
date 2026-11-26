"use client";

import { useEffect, useRef, useState } from "react";
import { deleteFramingChartAction, duplicateFramingChartAction, listFramingChartsAction, renameFramingChartAction, saveFramingChartAction } from "@/app/admin/framing-actions";
import { buildSpec, parseState } from "@/lib/framing/frame";

export type Chart = { id: string; name: string; state: Record<string, string>; updatedAt: string };
const fmtDate = (iso: string) => new Date(iso).toLocaleDateString("id-ID", { day: "numeric", month: "short", year: "numeric" });

/** Header picker for saved charts: a trigger plus a full-width panel anchored to the sticky preview. */
export function SavedCharts({ slug, project, state, charts, setCharts, openId, setOpenId, dirty, onOpen, onNew }: {
  slug: string; project: string; state: Record<string, string>; charts: Chart[]; setCharts: (c: Chart[]) => void;
  openId: string | null; setOpenId: (id: string | null) => void; dirty: boolean; onOpen: (c: Chart) => void; onNew: () => void;
}) {
  const [open, setOpen] = useState(false), [busy, setBusy] = useState(false), [err, setErr] = useState("");
  const [naming, setNaming] = useState<null | { id: string | null; name: string }>(null); // id null = save as new
  const wrap = useRef<HTMLDivElement>(null);
  const cur = charts.find((c) => c.id === openId);
  useEffect(() => {
    if (!open) return;
    const down = (e: PointerEvent) => { if (!wrap.current?.contains(e.target as Node)) setOpen(false); };
    const key = (e: KeyboardEvent) => { if (e.key === "Escape") { if (naming) setNaming(null); else { setOpen(false); wrap.current?.querySelector<HTMLElement>("[aria-haspopup]")?.focus(); } } };
    document.addEventListener("pointerdown", down); document.addEventListener("keydown", key);
    return () => { document.removeEventListener("pointerdown", down); document.removeEventListener("keydown", key); };
  }, [open, naming]);

  async function run(fn: () => Promise<{ ok: boolean; error?: string } & Record<string, unknown>>) {
    setBusy(true); setErr("");
    try {
      const r = await fn();
      if (!r.ok) { setErr(r.error ?? "Gagal."); return null; }
      const l = await listFramingChartsAction(slug); if (l.ok) setCharts(l.charts);
      return r;
    } catch { setErr("Gagal menghubungi server."); return null; } finally { setBusy(false); }
  }
  const submitName = async () => {
    if (!naming) return;
    const r = naming.id === null
      ? await run(() => saveFramingChartAction(slug, null, naming.name, state))
      : await run(() => renameFramingChartAction(slug, naming.id!, naming.name));
    if (r) { if (naming.id === null) setOpenId(String(r.id)); setNaming(null); }
  };
  const nameForm = (
    <form className="flex gap-2" onSubmit={(e) => { e.preventDefault(); void submitName(); }}>
      <input autoFocus aria-label="Nama chart" className="min-w-0 flex-1" maxLength={80} value={naming?.name ?? ""} placeholder="Nama chart" onChange={(e) => setNaming({ id: naming!.id, name: e.target.value })} />
      <button className="btn" disabled={busy || !naming?.name.trim()}>Simpan</button>
      <button type="button" className="btn-secondary" onClick={() => setNaming(null)}>Batal</button>
    </form>
  );
  return (
    <div ref={wrap} className="fc-saved">
      <button type="button" className="btn-secondary fc-saved-btn" aria-haspopup="dialog" aria-expanded={open} onClick={() => setOpen(!open)}>
        <span className="truncate">{cur ? cur.name : "Chart tersimpan"}</span>
        {dirty && <span className="fc-dot" role="img" aria-label="belum disimpan" title="Belum disimpan" />}
      </button>
      {open && (
        <div className="fc-panel" role="dialog" aria-label="Chart tersimpan">
          <div className="space-y-2 border-b border-line p-3">
            <p className="text-sm">{cur ? <>Terbuka: <b>{cur.name}</b>{dirty ? <span className="text-danger"> · belum disimpan</span> : <span className="muted"> · tersimpan</span>}</> : <span className="muted">Pengaturan saat ini belum disimpan sebagai chart.</span>}</p>
            {naming?.id === null ? nameForm : (
              <div className="flex flex-wrap gap-2">
                {cur && <button type="button" className="btn" disabled={busy || !dirty} onClick={() => run(() => saveFramingChartAction(slug, cur.id, null, state))}>Simpan</button>}
                <button type="button" className={cur ? "btn-secondary" : "btn"} disabled={busy} onClick={() => setNaming({ id: null, name: "" })}>Simpan sebagai baru</button>
                {cur && <button type="button" className="btn-ghost" onClick={() => { onNew(); setOpen(false); }}>Chart baru</button>}
              </div>
            )}
            <p role="status" className="text-sm text-danger">{err}</p>
          </div>
          {charts.length === 0 ? <p className="muted p-3 text-sm">Belum ada chart tersimpan.</p> : (
            <ul className="fc-list">
              {charts.map((c) => {
                const sp = buildSpec(parseState(c.state, project));
                return (
                  <li key={c.id} data-open={c.id === openId || undefined}>
                    {naming?.id === c.id ? nameForm : (<>
                      <button type="button" className="fc-open" onClick={() => { onOpen(c); setOpen(false); }}>
                        <b className="truncate">{c.name}</b>
                        <span className="muted truncate text-xs">{sp.camera} · {sp.mode} · {sp.arLabel} · {fmtDate(c.updatedAt)}</span>
                      </button>
                      <span className="fc-acts">
                        <button type="button" className="btn-ghost" disabled={busy} onClick={() => setNaming({ id: c.id, name: c.name })}>Ganti nama</button>
                        <button type="button" className="btn-ghost" disabled={busy} onClick={() => run(() => duplicateFramingChartAction(slug, c.id))}>Duplikat</button>
                        <button type="button" className="btn-danger" disabled={busy} onClick={async () => {
                          if (!window.confirm(`Hapus chart "${c.name}"? Tidak bisa dibatalkan.`)) return;
                          if (await run(() => deleteFramingChartAction(slug, c.id)) && c.id === openId) setOpenId(null);
                        }}>Hapus</button>
                      </span>
                    </>)}
                  </li>
                );
              })}
            </ul>
          )}
        </div>
      )}
    </div>
  );
}
