"use client";

import { useOptimistic, useState, useTransition } from "react";
import * as actions from "@/app/admin/deliverable-actions";
import { DELIVERABLE_LINK_LABELS } from "@/lib/assets/catalog";
import type { Attachment } from "@/lib/assets/service";
import {
  CUTDOWN_CONTENTS, CUTDOWN_DURATIONS, CUTDOWN_RATIOS, DELIVERABLE_STATUSES, DELIVERY_PLATFORMS, deliverableStatus,
  GROUPS, isDone, PRESETS, resolveSpec, SPEC_FIELDS,
} from "@/lib/deliverables/catalog";
import type { Deliverable, DeliverableInput } from "@/lib/deliverables/service";
import { fmtDate } from "@/lib/schedule/dates";
import { AttachmentList, useAct } from "../assets/AttachmentList";
import { Combobox, Drawer } from "../ui/controls";
import { Icon } from "../ui/icons";
import { useToast } from "../ui/toast";

type Mode = "edit" | "status" | "view";
type Panel = { kind: "item"; id: string } | { kind: "preset" } | { kind: "cutdown" } | { kind: "manual" };
type Props = {
  deliverables: Deliverable[]; attachments: Attachment[]; tracks: { id: string; name: string }[];
  techSpec: Record<string, string>; slug: string; mode: Mode; today: string;
};

function SpecChips({ spec }: { spec: Record<string, string> }) {
  const values = SPEC_FIELDS.map((f) => spec[f.key]).filter(Boolean);
  if (!values.length) return <span className="muted">—</span>;
  return <span className="muted text-xs">{values.join(" · ")}</span>;
}

function TrackSelect({ tracks, defaultValue }: { tracks: Props["tracks"]; defaultValue?: string | null }) {
  return (
    <label>
      <span>Track (opsional)</span>
      <select name="trackId" defaultValue={defaultValue ?? ""}>
        <option value="">— Seluruh project</option>
        {tracks.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
      </select>
    </label>
  );
}

export function DeliverablesBoard({ deliverables, attachments, tracks, techSpec, slug, mode, today }: Props) {
  const toast = useToast();
  const { act, busy } = useAct();
  const [, start] = useTransition();
  const [items, optimistic] = useOptimistic(deliverables, (cur, a: { id: string; status: Deliverable["status"] }) => cur.map((d) => (d.id === a.id ? { ...d, status: a.status } : d)));
  const [query, setQuery] = useState("");
  const [fPlatform, setFPlatform] = useState("");
  const [fStatus, setFStatus] = useState("");
  const [fTrack, setFTrack] = useState("");
  const [panel, setPanel] = useState<Panel | null>(null);
  const editable = mode === "edit";
  const trackName = new Map(tracks.map((t) => [t.id, t.name]));
  const linksOf = (id: string) => attachments.filter((a) => a.targetType === "deliverable" && a.targetId === id);

  const q = query.trim().toLowerCase();
  const shown = items.filter((d) =>
    (!fPlatform || d.platform === fPlatform) && (!fStatus || (d.origin === "delivered" && d.status === fStatus)) && (!fTrack || d.trackId === fTrack) &&
    (!q || [d.name, d.platform, d.groupName, ...Object.values(d.spec)].some((v) => v.toLowerCase().includes(q))),
  );
  const tracked = items.filter((d) => d.origin === "delivered");
  const doneCount = tracked.filter((d) => isDone(d.status)).length;
  const pct = tracked.length ? Math.round((doneCount / tracked.length) * 100) : 0;
  const platforms = [...new Set(items.map((d) => d.platform))];

  // platform -> group -> items, in catalog order
  const grouped = platforms.filter((p) => shown.some((d) => d.platform === p)).map((p) => {
    const rows = shown.filter((d) => d.platform === p);
    const groups = [...new Set(rows.map((d) => d.groupName))].sort((a, b) => (GROUPS.indexOf(a) + 99) % 99 - (GROUPS.indexOf(b) + 99) % 99);
    return { platform: p, groups: groups.map((g) => ({ name: g, rows: rows.filter((d) => d.groupName === g) })) };
  });

  // cutdown matrices: content -> duration x ratio
  const matrices = [...new Set(shown.filter((d) => d.presetId?.startsWith("cutdown:")).map((d) => `${d.presetId}|${d.platform}|${d.trackId ?? ""}`))].map((key) => {
    const [presetId, platform, trackId] = key.split("|");
    const cells = shown.filter((d) => d.presetId === presetId && d.platform === platform && (d.trackId ?? "") === trackId);
    return {
      key, title: `${presetId.slice(8)}${platform ? ` · ${platform}` : ""}${trackId ? ` · ${trackName.get(trackId) ?? ""}` : ""}`,
      durations: [...new Set(cells.map((c) => c.spec.duration))], ratios: [...new Set(cells.map((c) => c.spec.aspectRatio))], cells,
    };
  });

  function setStatus(d: Deliverable, status: string) {
    start(async () => {
      optimistic({ id: d.id, status: status as Deliverable["status"] });
      const r = await actions.setDeliverableStatus(slug, d.id, status);
      toast(r.ok ? { message: `"${d.name}" → ${deliverableStatus(status).label}.` } : { message: r.error, tone: "error" });
    });
  }

  const panelItem = panel?.kind === "item" ? items.find((d) => d.id === panel.id) : undefined;

  return (
    <div className="space-y-6">
      {items.length > 0 && (
        <section className="space-y-3">
          <div className="flex flex-wrap items-baseline justify-between gap-2">
            <div><span className="font-display text-3xl font-bold tabular-nums">{doneCount}</span><span className="font-semibold text-ink-2"> / {tracked.length} terkirim</span></div>
            <div className="seg">
              {DELIVERABLE_STATUSES.map((s) => {
                const n = tracked.filter((d) => d.status === s.value).length;
                return n ? <button key={s.value} type="button" aria-pressed={fStatus === s.value} onClick={() => setFStatus(fStatus === s.value ? "" : s.value)}>{s.label} {n}</button> : null;
              })}
            </div>
          </div>
          <div className="meter !h-2" role="progressbar" aria-valuenow={pct} aria-valuemin={0} aria-valuemax={100} aria-label="Progres deliverables"><span style={{ width: `${pct}%` }} /></div>
        </section>
      )}

      <div className="flex flex-wrap items-center gap-2">
        <input className="max-w-56" type="search" placeholder="Cari deliverable, format…" aria-label="Cari deliverable" value={query} onChange={(e) => setQuery(e.target.value)} />
        <select aria-label="Filter platform" className="!w-auto" value={fPlatform} onChange={(e) => setFPlatform(e.target.value)}>
          <option value="">Semua platform</option>
          {platforms.map((p) => <option key={p} value={p}>{p || "Tanpa platform"}</option>)}
        </select>
        {tracks.length > 0 && (
          <select aria-label="Filter track" className="!w-auto" value={fTrack} onChange={(e) => setFTrack(e.target.value)}>
            <option value="">Semua track</option>
            {tracks.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
          </select>
        )}
        {editable && (
          <div className="ml-auto flex flex-wrap gap-2">
            <button type="button" className="btn" onClick={() => setPanel({ kind: "preset" })}>+ Dari preset</button>
            <button type="button" className="btn-secondary" onClick={() => setPanel({ kind: "cutdown" })}>+ Matriks cutdown</button>
            <button type="button" className="btn-secondary" onClick={() => setPanel({ kind: "manual" })}>+ Manual</button>
          </div>
        )}
      </div>

      {items.length === 0 && (
        <div className="empty">
          <p className="font-medium">Belum ada deliverables.</p>
          <p className="muted mt-1">{editable ? "Mulai dari preset platform (Bioskop, Netflix, Prime Video, YouTube), lalu tambah atau kurangi sesuai kebutuhan." : "Daftar deliverables belum dibuat."}</p>
        </div>
      )}
      {items.length > 0 && shown.length === 0 && <p className="empty muted">Tidak ada deliverable yang cocok dengan filter.</p>}

      {matrices.map((m) => (
        <section key={m.key} className="card" data-matrix={m.title}>
          <h2 className="section-band">Matriks cutdown — {m.title}</h2>
          <div className="overflow-x-auto"><table className="table">
            <thead><tr><th />{m.ratios.map((r) => <th key={r} className="text-center">{r}</th>)}</tr></thead>
            <tbody>
              {m.durations.map((dur) => (
                <tr key={dur}>
                  <th scope="row">{dur}</th>
                  {m.ratios.map((r) => {
                    const cell = m.cells.find((c) => c.spec.duration === dur && c.spec.aspectRatio === r);
                    return (
                      <td key={r} className="!p-1">
                        {cell ? (
                          <button type="button" title={cell.name} data-status={cell.status} className="status w-28 cursor-pointer px-2 py-1.5 text-xs font-medium" onClick={() => setPanel({ kind: "item", id: cell.id })}>
                            {deliverableStatus(cell.status).label}{linksOf(cell.id).length > 0 && <Icon name="external" />}
                          </button>
                        ) : <span className="muted block w-28 text-center text-xs">—</span>}
                      </td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </table></div>
        </section>
      ))}

      {grouped.map(({ platform, groups }, pi) => (
        <section key={platform} className="card" data-platform={platform} data-ph={(pi % 8) + 1}>
          <h2 className="section-band">{platform || "Tanpa platform"}<span className="section-count">{groups.reduce((n, g) => n + g.rows.length, 0)}</span></h2>
          <div className="overflow-x-auto"><table className="table">
            <thead><tr><th>Deliverable</th><th>Spesifikasi</th><th>Track</th><th>Due</th><th>Link</th><th>Status</th></tr></thead>
            {groups.map((g) => (
              <tbody key={g.name}>
                <tr className="group-row"><th colSpan={6} scope="colgroup">{g.name || "Lainnya"} <span className="font-normal">· {g.rows.length}</span></th></tr>
                {g.rows.map((d) => {
                  const links = linksOf(d.id);
                  const late = d.origin === "delivered" && d.dueDate && d.dueDate < today && !isDone(d.status);
                  return (
                    <tr key={d.id} className="hoverable" data-deliverable={d.name}>
                      <td>
                        <button type="button" className="cursor-pointer text-left font-medium hover:underline" onClick={() => setPanel({ kind: "item", id: d.id })}>{d.name}</button>
                        {d.internal && <span className="tag tag-warn ml-1">Internal</span>}
                      </td>
                      <td><SpecChips spec={d.spec} /></td>
                      <td className="muted whitespace-nowrap">{d.trackId ? trackName.get(d.trackId) : "—"}</td>
                      <td className={`whitespace-nowrap ${late ? "font-medium text-danger" : "muted"}`}>{d.dueDate ? fmtDate(d.dueDate) : "—"}</td>
                      <td className="whitespace-nowrap">
                        {links[0]?.versions[0] ? <a href={links[0].versions[0].url} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 underline underline-offset-2">Buka <Icon name="external" />{links.length > 1 && ` (${links.length})`}</a> : <span className="muted">—</span>}
                      </td>
                      <td>
                        {d.origin === "derived" ? <span className="tag">Diturunkan platform</span>
                          : mode === "view" ? <span className="status" data-status={d.status}>{deliverableStatus(d.status).label}</span>
                          : (
                            <select aria-label={`Status ${d.name}`} className="status-select" value={d.status} onChange={(e) => setStatus(d, e.target.value)}>
                              {DELIVERABLE_STATUSES.map((s) => <option key={s.value} value={s.value}>{s.label}</option>)}
                            </select>
                          )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            ))}
          </table></div>
        </section>
      ))}

      {panelItem && (
        <Drawer title={panelItem.name} ph={(Math.max(0, platforms.indexOf(panelItem.platform)) % 8) + 1} onClose={() => setPanel(null)}>
          <div className="space-y-1.5 text-sm">
            <div className="muted">{[panelItem.platform, panelItem.groupName, panelItem.trackId && trackName.get(panelItem.trackId)].filter(Boolean).join(" · ")}</div>
            <SpecChips spec={panelItem.spec} />
            <div className="flex flex-wrap gap-1.5">
              {panelItem.origin === "derived" ? <span className="tag">Diturunkan platform — tidak dikirim</span> : <span className="status" data-status={panelItem.status}>{deliverableStatus(panelItem.status).label}</span>}
              {panelItem.dueDate && <span className="tag">Due {fmtDate(panelItem.dueDate)}</span>}
              {panelItem.presetVersion && <span className="tag">Preset: {panelItem.presetVersion}</span>}
            </div>
            {panelItem.notes && <p className="whitespace-pre-wrap">{panelItem.notes}</p>}
          </div>
          {panelItem.origin === "delivered" && (
            <section className="hairline space-y-2 pt-5">
              <h3>Link & versi</h3>
              <AttachmentList attachments={linksOf(panelItem.id)} target={{ type: "deliverable", id: panelItem.id }} slug={slug} canEdit={mode !== "view"} canApprove={editable} labelOptions={DELIVERABLE_LINK_LABELS} defaultKind="asset" />
            </section>
          )}
          {editable && (
            <ItemForm key={panelItem.id} item={panelItem} tracks={tracks} busy={busy}
              onSave={(input) => act(() => actions.updateDeliverable(slug, panelItem.id, input), `"${input.name}" disimpan.`)}
              onDelete={() => { if (window.confirm(`Hapus deliverable "${panelItem.name}" beserta link-nya?`)) act(() => actions.deleteDeliverables(slug, [panelItem.id]), `"${panelItem.name}" dihapus.`, () => setPanel(null)); }}
            />
          )}
        </Drawer>
      )}

      {panel?.kind === "manual" && (
        <Drawer title="Deliverable baru" onClose={() => setPanel(null)}>
          <ItemForm tracks={tracks} busy={busy} onSave={(input) => act(() => actions.addDeliverable(slug, input), `"${input.name}" ditambahkan.`, () => setPanel(null))} />
        </Drawer>
      )}

      {panel?.kind === "preset" && (
        <Drawer title="Tambah dari preset" onClose={() => setPanel(null)}>
          <PresetForm tracks={tracks} techSpec={techSpec} busy={busy}
            onApply={(input) => start(async () => {
              const r = await actions.applyPreset(slug, input);
              if (!r.ok) return toast({ message: r.error, tone: "error" });
              toast({ message: `${r.added} deliverable ditambahkan${r.skipped ? `, ${r.skipped} sudah ada` : ""}.` });
              setPanel(null);
            })}
          />
        </Drawer>
      )}

      {panel?.kind === "cutdown" && (
        <Drawer title="Matriks cutdown" onClose={() => setPanel(null)}>
          <CutdownForm tracks={tracks} busy={busy}
            onCreate={(input) => start(async () => {
              const r = await actions.generateCutdowns(slug, input);
              if (!r.ok) return toast({ message: r.error, tone: "error" });
              toast({ message: `${r.added} cutdown dibuat${r.skipped ? `, ${r.skipped} sudah ada` : ""}.` });
              setPanel(null);
            })}
          />
        </Drawer>
      )}
    </div>
  );
}

function ItemForm({ item, tracks, busy, onSave, onDelete }: { item?: Deliverable; tracks: Props["tracks"]; busy: boolean; onSave: (input: DeliverableInput) => void; onDelete?: () => void }) {
  return (
    <form
      className="hairline space-y-3 pt-5 first:border-0 first:pt-0"
      onSubmit={(e) => {
        e.preventDefault();
        const f = new FormData(e.currentTarget);
        const text = (k: string) => String(f.get(k) ?? "");
        onSave({
          name: text("name"), platform: text("platform"), groupName: text("groupName"), trackId: text("trackId") || null,
          spec: Object.fromEntries(SPEC_FIELDS.map((s) => [s.key, text(`spec.${s.key}`)])),
          origin: f.get("derived") === "on" ? "derived" : "delivered", dueDate: text("dueDate") || null, notes: text("notes"), internal: f.get("internal") === "on",
        });
      }}
    >
      <label><span>Nama</span><input name="name" required defaultValue={item?.name} /></label>
      <div className="grid grid-cols-2 gap-3">
        <div><span className="mb-1 block text-xs font-semibold text-ink-2">Platform</span><Combobox name="platform" options={DELIVERY_PLATFORMS} defaultValue={item?.platform} /></div>
        <div><span className="mb-1 block text-xs font-semibold text-ink-2">Kelompok</span><Combobox name="groupName" options={GROUPS} defaultValue={item?.groupName} /></div>
        {SPEC_FIELDS.map((s) => (
          <div key={s.key}><span className="mb-1 block text-xs font-semibold text-ink-2">{s.label}</span><Combobox name={`spec.${s.key}`} options={[...s.options]} defaultValue={item?.spec[s.key]} /></div>
        ))}
        <TrackSelect tracks={tracks} defaultValue={item?.trackId} />
        <label><span>Due date</span><input name="dueDate" type="date" defaultValue={item?.dueDate ?? ""} /></label>
      </div>
      <label><span>Catatan</span><textarea name="notes" rows={2} defaultValue={item?.notes} /></label>
      <label className="check"><input type="checkbox" name="derived" defaultChecked={item?.origin === "derived"} /> Diturunkan platform (tidak dikirim)</label>
      <label className="check"><input type="checkbox" name="internal" defaultChecked={item?.internal} /> Internal (tidak tampil di link view-only)</label>
      <div className="flex items-center gap-2">
        <button className="btn" disabled={busy}>{item ? "Simpan" : "Tambah deliverable"}</button>
        {onDelete && <button type="button" className="btn-danger" disabled={busy} onClick={onDelete}>Hapus</button>}
      </div>
    </form>
  );
}

function PresetForm({ tracks, techSpec, busy, onApply }: { tracks: Props["tracks"]; techSpec: Record<string, string>; busy: boolean; onApply: (input: { presetId: string; trackId: string | null; dueDate: string | null; skip: number[] }) => void }) {
  // optional items start unticked
  const optional = (id: string) => new Set(PRESETS.find((p) => p.id === id)!.items.flatMap((it, n) => (it.optional ? [n] : [])));
  const [presetId, setPresetId] = useState(PRESETS[0].id);
  const [skip, setSkip] = useState<Set<number>>(() => optional(PRESETS[0].id));
  const preset = PRESETS.find((p) => p.id === presetId)!;
  const pick = (id: string) => { setPresetId(id); setSkip(optional(id)); };
  const count = preset.items.length - skip.size;
  return (
    <form className="space-y-4" onSubmit={(e) => { e.preventDefault(); const f = new FormData(e.currentTarget); onApply({ presetId, trackId: String(f.get("trackId") ?? "") || null, dueDate: String(f.get("dueDate") ?? "") || null, skip: [...skip] }); }}>
      <label>
        <span>Preset</span>
        <select name="presetId" value={presetId} onChange={(e) => pick(e.target.value)}>{PRESETS.map((p) => <option key={p.id} value={p.id}>{p.platform} — {p.label}</option>)}</select>
      </label>
      <div className="hairline space-y-2 pt-3 text-sm">
        <div className="flex flex-wrap">
          <span className="tag">{preset.specVersion}</span>
          {preset.verifiedAt && <span className="tag tag-ok">Dicek {fmtDate(preset.verifiedAt)}</span>}
        </div>
        {!preset.verifiedAt && <p className="notice" style={{ "--tone": "var(--warn)" } as React.CSSProperties}>Belum diverifikasi ke spec resmi</p>}
        <p>{preset.note}</p>
        {preset.rules.length > 0 && <ul className="list-disc space-y-1 pl-5">{preset.rules.map((r) => <li key={r}>{r}</li>)}</ul>}
        <p className="muted text-xs">Sumber: {preset.source.map((s, i) => <span key={s.label}>{i > 0 && ", "}{s.url ? <a href={s.url} target="_blank" rel="noreferrer" className="underline">{s.label}</a> : s.label}</span>)}. Spec platform berubah; cek ulang sebelum delivery.</p>
      </div>
      <fieldset className="space-y-1.5">
        <legend className="mb-1 text-xs font-semibold text-ink-2">Item ({count} dipilih) — hilangkan centang untuk mengurangi</legend>
        {preset.items.map((it, n) => (
          <label key={`${presetId}-${n}`} className="check items-start">
            <input type="checkbox" className="mt-0.5" checked={!skip.has(n)} onChange={(e) => setSkip((cur) => { const s = new Set(cur); if (e.target.checked) s.delete(n); else s.add(n); return s; })} />
            <span className="inline min-w-0">
              <span className="inline font-medium">{it.name}</span>{" "}
              <span className="muted inline text-xs">{it.group}{it.origin === "derived" ? " · diturunkan platform" : ""}{it.optional ? " · opsional" : ""}{Object.values(resolveSpec(it.spec, techSpec)).length > 0 && ` · ${Object.values(resolveSpec(it.spec, techSpec)).join(", ")}`}</span>
            </span>
          </label>
        ))}
      </fieldset>
      <div className="grid grid-cols-2 gap-3">
        <TrackSelect tracks={tracks} />
        <label><span>Due date (opsional)</span><input name="dueDate" type="date" /></label>
      </div>
      <button className="btn" disabled={busy || count === 0}>Tambah {count} deliverable</button>
    </form>
  );
}

function CutdownForm({ tracks, busy, onCreate }: { tracks: Props["tracks"]; busy: boolean; onCreate: (input: { content: string; platform: string; trackId: string | null; durations: string[]; ratios: string[]; dueDate: string | null }) => void }) {
  const [durations, setDurations] = useState<Set<string>>(new Set(["30s", "15s"]));
  const [ratios, setRatios] = useState<Set<string>>(new Set(["16:9", "9:16"]));
  const [extraD, setExtraD] = useState("");
  const [extraR, setExtraR] = useState("");
  const split = (v: string) => v.split(",").map((x) => x.trim()).filter(Boolean);
  const allD = [...CUTDOWN_DURATIONS.filter((d) => durations.has(d)), ...split(extraD)];
  const allR = [...CUTDOWN_RATIOS.filter((r) => ratios.has(r)), ...split(extraR)];
  const toggle = (set: React.Dispatch<React.SetStateAction<Set<string>>>, v: string) => set((cur) => { const s = new Set(cur); if (!s.delete(v)) s.add(v); return s; });
  const chips = (options: string[], value: Set<string>, set: React.Dispatch<React.SetStateAction<Set<string>>>) => (
    <div className="flex flex-wrap gap-x-5 gap-y-2">
      {options.map((o) => (
        <label key={o} className="check">
          <input type="checkbox" checked={value.has(o)} onChange={() => toggle(set, o)} /> {o}
        </label>
      ))}
    </div>
  );
  return (
    <form className="space-y-4" onSubmit={(e) => { e.preventDefault(); const f = new FormData(e.currentTarget); onCreate({ content: String(f.get("content") ?? ""), platform: String(f.get("platform") ?? ""), trackId: String(f.get("trackId") ?? "") || null, durations: allD, ratios: allR, dueDate: String(f.get("dueDate") ?? "") || null }); }}>
      <p className="muted text-sm">Membuat satu deliverable untuk setiap kombinasi durasi × ratio. Sel yang tidak dibutuhkan bisa dihapus setelahnya.</p>
      <div className="grid grid-cols-2 gap-3">
        <div><span className="mb-1 block text-xs font-semibold text-ink-2">Konten</span><Combobox name="content" options={CUTDOWN_CONTENTS} defaultValue="Trailer" /></div>
        <div><span className="mb-1 block text-xs font-semibold text-ink-2">Platform</span><Combobox name="platform" options={DELIVERY_PLATFORMS} defaultValue="YouTube" /></div>
      </div>
      <fieldset className="space-y-2">
        <legend className="mb-1 text-xs font-semibold text-ink-2">Durasi</legend>
        {chips(CUTDOWN_DURATIONS, durations, setDurations)}
        <input aria-label="Durasi lain" placeholder="Durasi lain, pisahkan koma (mis. 90s, 5s)" value={extraD} onChange={(e) => setExtraD(e.target.value)} />
      </fieldset>
      <fieldset className="space-y-2">
        <legend className="mb-1 text-xs font-semibold text-ink-2">Ratio</legend>
        {chips(CUTDOWN_RATIOS, ratios, setRatios)}
        <input aria-label="Ratio lain" placeholder="Ratio lain, pisahkan koma (mis. 2:3)" value={extraR} onChange={(e) => setExtraR(e.target.value)} />
      </fieldset>
      <div className="grid grid-cols-2 gap-3">
        <TrackSelect tracks={tracks} />
        <label><span>Due date (opsional)</span><input name="dueDate" type="date" /></label>
      </div>
      <button className="btn" disabled={busy || !allD.length || !allR.length}>Buat {allD.length} × {allR.length} = {allD.length * allR.length} cutdown</button>
    </form>
  );
}
