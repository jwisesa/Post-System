"use client";

import { useMemo, useState } from "react";
import { confirmSceneTag, deleteScene, removeSceneTag, setSceneTags, updateScene } from "@/app/admin/script-actions";
import { Drawer, SubmitButton } from "@/components/ui/controls";
import { Icon } from "@/components/ui/icons";
import { phaseLabel, type Phase } from "@/lib/script/needs";
import type { SceneRow } from "@/lib/script/service";
import { defaultPhase } from "@/lib/script/tags";
import { fmtDuration, fmtPage, INT_EXTS, placeOf, TAG_KINDS, TAG_LABEL, TIMES_OF_DAY, type PostTag, type TagKind } from "@/lib/script/types";
import { useToast } from "../ui/toast";

const natural = new Intl.Collator("id", { numeric: true });
type Res = { ok: boolean; error?: string };

/** Runs a server action and answers with a toast either way. */
function useAct() {
  const toast = useToast();
  return async (p: Promise<Res>, done: string) => {
    const r = await p;
    toast(r.ok ? { message: done } : { message: r.error ?? "Gagal menyimpan.", tone: "error" });
    return r.ok;
  };
}

const kindNum = (k: string) => TAG_KINDS.indexOf(k as TagKind) + 1;

/** One marker per kind. A parser suggestion is muted with "?"; click it to confirm. */
function TagMarks({ slug, scene, canEdit, stop }: { slug: string; scene: SceneRow; canEdit: boolean; stop?: boolean }) {
  const act = useAct();
  const halt = stop ? (e: React.SyntheticEvent) => e.stopPropagation() : undefined;
  if (!scene.postTags.length) return <span className="muted">—</span>;
  return (
    <span className="sa-tags" onClick={halt} onKeyDown={halt}>
      {scene.postTags.map((t) => (
        <span key={t.kind} className="sa-tagm" data-k={kindNum(t.kind)} data-auto={t.auto ? "" : undefined}>
          {canEdit && t.auto ? (
            <button type="button" title={`Saran dari naskah${t.keyword ? ` (kata kunci ${t.keyword})` : ""}. Klik untuk konfirmasi.`} aria-label={`Konfirmasi saran tag ${TAG_LABEL[t.kind]} adegan ${scene.number}`}
              onClick={() => act(confirmSceneTag(slug, scene.id, t.kind), `Tag ${TAG_LABEL[t.kind]} dikonfirmasi.`)}>{TAG_LABEL[t.kind]} ?</button>
          ) : (
            <span title={t.auto ? `Saran dari naskah${t.keyword ? ` (kata kunci ${t.keyword})` : ""}` : t.note || undefined}>{TAG_LABEL[t.kind]}{t.auto ? " ?" : ""}</span>
          )}
          {canEdit && (
            <button type="button" className="sa-x" aria-label={`Hapus tag ${TAG_LABEL[t.kind]} adegan ${scene.number}`} onClick={() => act(removeSceneTag(slug, scene.id, t.kind), `Tag ${TAG_LABEL[t.kind]} dihapus.`)}><Icon name="close" /></button>
          )}
        </span>
      ))}
    </span>
  );
}

/** Kind + optional note + optional phase. The phase follows the kind (default by name) until the user picks one. */
function TagForm({ phases, label, onSubmit }: { phases: Phase[]; label: string; onSubmit: (v: { kind: TagKind; note: string; itemId: string | null }) => Promise<boolean> }) {
  const [kind, setKind] = useState<TagKind>("vfx");
  const [itemId, setItemId] = useState(defaultPhase("vfx", phases) ?? "");
  const [note, setNote] = useState("");
  return (
    <form className="sa-tagform" action={async () => { if (await onSubmit({ kind, note, itemId: itemId || null })) setNote(""); }}>
      <label><span>Jenis tag</span>
        <select value={kind} onChange={(e) => { const k = e.target.value as TagKind; setKind(k); setItemId(defaultPhase(k, phases) ?? ""); }}>{TAG_KINDS.map((k) => <option key={k} value={k}>{TAG_LABEL[k]}</option>)}</select></label>
      <label><span>Fase jadwal</span>
        <select value={itemId} onChange={(e) => setItemId(e.target.value)}>
          <option value="">{phases.length ? "Belum dipilih" : "Belum ada fase"}</option>
          {phases.map((p) => <option key={p.id} value={p.id}>{phaseLabel(p)}</option>)}
        </select></label>
      <label><span>Catatan (opsional)</span><input value={note} maxLength={200} onChange={(e) => setNote(e.target.value)} /></label>
      <SubmitButton className="btn-secondary" pendingLabel="Menyimpan…">{label}</SubmitButton>
    </form>
  );
}

function SceneDrawer({ slug, scene, scriptTitle, phases, canEdit, onClose }: { slug: string; scene: SceneRow; scriptTitle: string; phases: Phase[]; canEdit: boolean; onClose: () => void }) {
  const act = useAct();
  const [deleting, setDeleting] = useState(false);
  const field = (k: "heading" | "number" | "location" | "notes", label: string, area?: boolean) => (
    <label><span>{label}</span>{area ? <textarea name={k} rows={3} maxLength={2000} defaultValue={scene[k]} /> : <input name={k} defaultValue={scene[k]} required={k === "number"} />}</label>
  );
  const sel = (k: "intExt" | "timeOfDay", label: string, opts: readonly string[]) => (
    <label><span>{label}</span><select name={k} defaultValue={scene[k]}><option value="">—</option>{opts.map((o) => <option key={o}>{o}</option>)}</select></label>
  );
  const phaseName = (id?: string | null) => { const p = phases.find((x) => x.id === id); return p && phaseLabel(p); };
  const retag = (t: PostTag, itemId: string | null) => act(setSceneTags(slug, [scene.id], { kind: t.kind, note: t.note, itemId }), `Tag ${TAG_LABEL[t.kind]} disimpan.`);
  return (
    <Drawer title={`Adegan ${scene.number}`} crumb={scriptTitle} onClose={onClose} bodyKey={scene.id}
      head={<p className="num text-sm text-ink-2">{scene.heading} · Hal. {fmtPage(scene.pageStart)}–{fmtPage(scene.pageEnd)} · ~{fmtDuration(scene.estSeconds)}{scene.characters.length > 0 && ` · ${scene.characters.map((c) => c.name).join(", ")}`}</p>}>
      {canEdit ? (
        <form key={`${scene.id}:${scene.heading}:${scene.number}:${scene.location}:${scene.intExt}:${scene.timeOfDay}:${scene.notes}`} className="space-y-3"
          action={async (f) => {
            const g = (k: string) => String(f.get(k) ?? "");
            await act(updateScene(slug, scene.id, { heading: g("heading"), number: g("number"), intExt: g("intExt"), location: g("location"), timeOfDay: g("timeOfDay"), notes: g("notes") }), `Adegan ${scene.number} disimpan.`);
          }}>
          {field("heading", "Judul adegan")}
          {field("number", "Nomor")}
          {sel("intExt", "INT/EXT", INT_EXTS)}
          {field("location", "Lokasi")}
          {sel("timeOfDay", "Waktu", TIMES_OF_DAY)}
          {field("notes", "Catatan", true)}
          <div className="drawer-foot">
            <SubmitButton>Simpan</SubmitButton>
            <button type="button" className="btn-danger" disabled={deleting} onClick={async () => {
              if (!window.confirm(`Hapus adegan ${scene.number} dari daftar?`)) return;
              setDeleting(true);
              if (await act(deleteScene(slug, scene.id), `Adegan ${scene.number} dihapus.`)) onClose(); else setDeleting(false);
            }}>{deleting ? "Menghapus…" : "Hapus"}</button>
          </div>
        </form>
      ) : scene.notes ? <p className="text-sm whitespace-pre-wrap">{scene.notes}</p> : null}

      <section className="space-y-2 text-sm">
        <h3>Tag post</h3>
        {scene.postTags.length === 0 && <p className="muted">Belum ada tag.</p>}
        <ul className="rows">
          {scene.postTags.map((t) => (
            <li key={t.kind} className="grid gap-1 py-2">
              <div className="flex flex-wrap items-center gap-2">
                <TagMarks slug={slug} scene={{ ...scene, postTags: [t] }} canEdit={canEdit} />
                {t.auto && t.keyword && <span className="muted text-xs">kata kunci {t.keyword}</span>}
                {t.note && <span className="text-ink-2">{t.note}</span>}
              </div>
              {canEdit ? (
                <label className="sa-inline"><span>Fase</span>
                  <select aria-label={`Fase untuk ${TAG_LABEL[t.kind]}`} value={t.itemId && phaseName(t.itemId) ? t.itemId : ""} onChange={(e) => retag(t, e.target.value || null)}>
                    <option value="">Belum dipilih</option>
                    {phases.map((p) => <option key={p.id} value={p.id}>{phaseLabel(p)}</option>)}
                  </select></label>
              ) : <span className="muted text-xs">Fase: {phaseName(t.itemId) ?? "belum dipilih"}</span>}
            </li>
          ))}
        </ul>
        {canEdit && <TagForm key={scene.id} phases={phases} label="Tambah tag" onSubmit={(v) => act(setSceneTags(slug, [scene.id], v), `Tag ${TAG_LABEL[v.kind]} ditambahkan.`)} />}
      </section>
    </Drawer>
  );
}

export function Scenes({ slug, scriptTitle, scenes, phases, canEdit, initialTag }: { slug: string; scriptTitle: string; scenes: SceneRow[]; phases: Phase[]; canEdit: boolean; initialTag: string }) {
  const act = useAct();
  const [loc, setLoc] = useState("");
  const [who, setWho] = useState("");
  const [tod, setTod] = useState("");
  const [tag, setTag] = useState(initialTag);
  const [byNumber, setByNumber] = useState(false);
  const [open, setOpen] = useState<string | null>(null);
  const [sel, setSel] = useState<Set<string>>(new Set());
  const places = useMemo(() => [...new Set(scenes.map((s) => placeOf(s.location)).filter(Boolean))].sort(), [scenes]);
  const names = useMemo(() => [...new Set(scenes.flatMap((s) => s.characters.map((c) => c.name)))].sort(), [scenes]);
  const shown = useMemo(() => {
    const rows = scenes.filter((s) => (!loc || placeOf(s.location) === loc) && (!who || s.characters.some((c) => c.name === who)) && (!tod || s.timeOfDay === tod) && (!tag || s.postTags.some((t) => t.kind === tag)));
    return byNumber ? [...rows].sort((a, b) => natural.compare(a.number, b.number)) : rows;
  }, [scenes, loc, who, tod, tag, byNumber]);
  const filtered = !!(loc || who || tod || tag);
  const total = shown.reduce((n, s) => n + s.estSeconds, 0);
  const current = scenes.find((s) => s.id === open);
  const picked = shown.filter((s) => sel.has(s.id)).map((s) => s.id);
  const toggle = (id: string) => setSel((p) => { const n = new Set(p); if (!n.delete(id)) n.add(id); return n; });
  const none = <span className="muted">—</span>;

  return (
    <div className="sa-wrap space-y-3" data-drawer={current ? "" : undefined}>
      <div className="flex flex-wrap items-end gap-3">
        <label className="field"><span className="field-label">Lokasi</span>
          <select value={loc} onChange={(e) => setLoc(e.target.value)}><option value="">Semua</option>{places.map((p) => <option key={p}>{p}</option>)}</select></label>
        <label className="field"><span className="field-label">Tokoh</span>
          <select value={who} onChange={(e) => setWho(e.target.value)}><option value="">Semua</option>{names.map((n) => <option key={n}>{n}</option>)}</select></label>
        <label className="field"><span className="field-label">Waktu</span>
          <select value={tod} onChange={(e) => setTod(e.target.value)}><option value="">Semua</option>{TIMES_OF_DAY.map((t) => <option key={t}>{t}</option>)}</select></label>
        <label className="field"><span className="field-label">Tag post</span>
          <select value={tag} onChange={(e) => setTag(e.target.value)}><option value="">Semua</option>{TAG_KINDS.map((k) => <option key={k} value={k}>{TAG_LABEL[k]}</option>)}</select></label>
        <button type="button" className="btn-secondary" aria-pressed={byNumber} onClick={() => setByNumber(!byNumber)}>Urutkan nomor</button>
      </div>

      {canEdit && picked.length > 0 && (
        <div className="sa-bulk" role="group" aria-label="Tag untuk adegan terpilih">
          <TagForm phases={phases} label={`Tambah tag ke ${picked.length} adegan`} onSubmit={async (v) => { const ok = await act(setSceneTags(slug, picked, v), `Tag ${TAG_LABEL[v.kind]} ditambahkan ke ${picked.length} adegan.`); if (ok) setSel(new Set()); return ok; }} />
          <button type="button" className="btn-ghost" onClick={() => setSel(new Set())}>Batal pilih</button>
        </div>
      )}

      <table className="table sa-table text-sm tabular-nums">
        <thead>
          <tr className="text-xs">
            {canEdit && <th className="sa-sel"><input type="checkbox" aria-label="Pilih semua adegan yang tampil" checked={shown.length > 0 && picked.length === shown.length} onChange={(e) => setSel(e.target.checked ? new Set(shown.map((s) => s.id)) : new Set())} /></th>}
            <th>No</th><th>Judul adegan</th><th className="sa-opt">INT/EXT</th><th>Lokasi</th><th>Waktu</th><th className="sa-opt">Hal.</th><th>Durasi</th><th className="sa-opt">Tokoh</th><th>Tag post</th><th className="sa-opt">Catatan</th><th><span className="sr-only">Aksi</span></th>
          </tr>
        </thead>
        <tbody>
          {shown.map((s) => (
            <tr key={s.id} className="hoverable sa-row" tabIndex={0} data-open={open === s.id ? "" : undefined} aria-label={`Adegan ${s.number}: ${s.heading}. Enter untuk membuka.`}
              onClick={() => setOpen(s.id)} onKeyDown={(e) => { if (e.key === "Enter" && e.target === e.currentTarget) setOpen(s.id); }}>
              {canEdit && <td className="sa-sel" onClick={(e) => e.stopPropagation()}><input type="checkbox" aria-label={`Pilih adegan ${s.number}`} checked={sel.has(s.id)} onChange={() => toggle(s.id)} /></td>}
              <td className="sa-num font-medium">{s.number}</td>
              <td className="sa-head">{s.heading}</td>
              <td className="sa-opt" data-l="INT/EXT">{s.intExt || none}</td>
              <td className="sa-loc" data-l="Lokasi">{s.location || none}</td>
              <td data-l="Waktu">{s.timeOfDay || none}</td>
              <td className="sa-opt whitespace-nowrap" data-l="Hal.">{fmtPage(s.pageStart)}–{fmtPage(s.pageEnd)}</td>
              <td className="whitespace-nowrap" data-l="Durasi">~{fmtDuration(s.estSeconds)}</td>
              <td className="sa-opt" data-l="Tokoh">{s.characters.map((c) => c.name).join(", ") || none}</td>
              <td className="sa-posts" data-l="Tag" data-nil={s.postTags.length ? undefined : ""}><TagMarks slug={slug} scene={s} canEdit={canEdit} stop /></td>
              <td className="sa-opt sa-notes" data-l="Catatan" data-nil={s.notes ? undefined : ""}>{s.notes || none}</td>
              <td className="sa-act"><button type="button" className="btn-ghost" aria-label={`${canEdit ? "Ubah" : "Buka"} adegan ${s.number}`} onClick={(e) => { e.stopPropagation(); setOpen(s.id); }}>{canEdit ? "Ubah" : "Buka"}</button></td>
            </tr>
          ))}
          {!shown.length && (
            <tr><td colSpan={12} className="px-2 py-4">
              <span className="muted">{filtered ? "Tidak ada adegan yang cocok dengan filter." : "Belum ada adegan."}</span>
              {filtered && <button type="button" className="btn-ghost ms-2" onClick={() => { setLoc(""); setWho(""); setTod(""); setTag(""); }}>Reset filter</button>}
            </td></tr>
          )}
        </tbody>
        <tfoot><tr><td colSpan={12}>Total {shown.length} adegan · ~{fmtDuration(total)}</td></tr></tfoot>
      </table>

      {current && <SceneDrawer key="drawer" slug={slug} scene={current} scriptTitle={scriptTitle} phases={phases} canEdit={canEdit} onClose={() => setOpen(null)} />}
    </div>
  );
}
