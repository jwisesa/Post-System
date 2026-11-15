"use client";

import { deleteShots, updateShot } from "@/app/admin/shot-actions";
import { Icon } from "@/components/ui/icons";
import { SHOT_STATUSES, shotStatus } from "@/lib/edl/edl";
import type { Shot, ShotPatch } from "@/lib/edl/service";
import { useToast } from "../ui/toast";
import { csv } from "./EdlTool";

export function ShotTracker({ slug, shots, canEdit, canTrack }: { slug: string; shots: Shot[]; canEdit: boolean; canTrack: boolean }) {
  const toast = useToast();
  const fail = (r: { ok: boolean; error?: string }) => { if (!r.ok) toast({ message: r.error ?? "Gagal menyimpan.", tone: "error" }); };
  const patch = async (s: Shot, p: ShotPatch) => fail(await updateShot(slug, s.id, p));
  const remove = async (s: Shot) => { if (window.confirm(`Hapus shot "${s.name}" dari tracker?`)) fail(await deleteShots(slug, [s.id])); };
  const text = (s: Shot, k: "vendor" | "version", width: string) =>
    canTrack ? (
      <input key={`${s.id}-${s[k]}`} aria-label={`${k === "vendor" ? "Vendor" : "Versi"} ${s.name}`} className={width} defaultValue={s[k]}
        onBlur={(e) => { if (e.target.value.trim() !== s[k]) patch(s, { [k]: e.target.value }); }}
        onKeyDown={(e) => { if (e.key === "Enter") e.currentTarget.blur(); }} />
    ) : s[k] || "—";

  return (
    <section className="card">
      <div className="mb-3 flex flex-wrap items-center gap-3">
        <h2 className="section-band">Shot tracker</h2>
        <span className="muted text-sm">
          {shots.length} shot{SHOT_STATUSES.map((st) => { const n = shots.filter((s) => s.status === st.value).length; return n ? ` · ${st.label} ${n}` : ""; }).join("")}
        </span>
        <span className="grow" />
        {shots.length > 0 && (
          <button type="button" className="btn-secondary" onClick={() => csv(`${slug}_ShotTracker.csv`, [
            ["Shot", "Status", "Vendor", "Version", "Reel", "Clip Name", "Source File", "Src In", "Src Out", "Rec In", "Rec Out", "Duration (fr)", "Handles (fr)", "FPS", "Scope of Work", "Retime", "Notes"],
            ...shots.map((s) => [s.name, shotStatus(s.status).label, s.vendor, s.version, s.reel, s.clipName, s.sourceFile, s.srcIn, s.srcOut, s.recIn, s.recOut, String(s.durationFrames), String(s.handles), s.fps, s.scope, s.retime, s.notes]),
          ])}><Icon name="download" />Tracker CSV</button>
        )}
      </div>
      {shots.length === 0 ? <p className="muted text-sm">Belum ada shot. Import timeline di atas, pilih shot, lalu simpan ke shot tracker.</p> : (
        <div className="overflow-x-auto">
          <table className="table text-sm tabular-nums">
            <thead><tr className="text-xs">{["Shot", "Status", "Vendor", "Versi", "Reel", "Clip", "Rec In", "Dur", "Handles", "Scope", ""].map((h, i) => <th key={i} className="px-2 py-1 text-start font-medium whitespace-nowrap">{h}</th>)}</tr></thead>
            <tbody>
              {shots.map((s) => (
                <tr key={s.id} className="hoverable">
                  <td className="px-2 py-1 font-medium whitespace-nowrap">{s.name}</td>
                  <td className="px-2 py-1">
                    {canTrack ? (
                      <select aria-label={`Status ${s.name}`} className="status-select !w-32" value={s.status} onChange={(e) => patch(s, { status: e.target.value })}>
                        {SHOT_STATUSES.map((st) => <option key={st.value} value={st.value}>{st.label}</option>)}
                      </select>
                    ) : shotStatus(s.status).label}
                  </td>
                  <td className="px-2 py-1">{text(s, "vendor", "!w-36")}</td>
                  <td className="px-2 py-1">{text(s, "version", "!w-20")}</td>
                  {[s.reel, s.clipName, s.recIn, String(s.durationFrames), String(s.handles), s.scope].map((v, c) => <td key={c} className="px-2 py-1 whitespace-nowrap">{v}</td>)}
                  <td className="px-2 py-1">{canEdit && <button type="button" className="btn-danger btn-icon" aria-label={`Hapus ${s.name}`} onClick={() => remove(s)}><Icon name="close" /></button>}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}
