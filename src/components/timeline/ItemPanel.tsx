"use client";

import type { DriveSummary } from "@/lib/drive-tracker/service";
import { useState } from "react";
import { addItemAction, addTrackAction, deleteItemAction, deleteTrackAction, rebaselineAction, setStatusAction, updateItemAction } from "@/app/admin/schedule-actions";
import { LINK_LABELS } from "@/lib/assets/catalog";
import type { Attachment, Comment } from "@/lib/assets/service";
import { addDays, fmtDate, fmtRange } from "@/lib/schedule/dates";
import type { Dep } from "@/lib/schedule/shift";
import { MILESTONE_NAME_OPTIONS, PHASE_COLORS, PHASE_NAME_OPTIONS, STATUSES, statusLabel, TRACK_NAME_OPTIONS, TRACK_TEMPLATES } from "@/lib/schedule/templates";
import { snap, type Cal } from "@/lib/schedule/workdays";
import type { FeedbackPoint } from "@/lib/feedback/service";
import { AttachmentList, CommentThread } from "../assets/AttachmentList";
import { saveTemplateAction } from "@/app/admin/template-actions";
import { ConfirmButton } from "../ui/controls";
import { useToast } from "../ui/toast";
import { FeedbackPanel } from "./FeedbackPanel";
import { SignoffPanel } from "./SignoffPanel";
import type { Signoff } from "@/lib/review/service";
import { MilestoneDate, PhaseDates } from "./DateFields";
import { Icon } from "../ui/icons";
import { durationLabel, isLate, slip, type Item, type Mode, type Track } from "./shared";

/** Radio swatches; value "" lets the item take its colour from its phase or position. */
function ColorField({ value }: { value: number | null }) {
  return (
    <fieldset>
      <legend className="mb-1 text-xs font-semibold text-ink-2">Warna</legend>
      <div className="flex flex-wrap items-center gap-1.5">
        <label className="check text-xs text-ink-2"><input type="radio" name="color" value="" defaultChecked={!value} /> Otomatis</label>
        {Array.from({ length: PHASE_COLORS }, (_, n) => n + 1).map((c) => (
          <label key={c} className="swatch-radio" title={`Warna ${c}`}>
            <input type="radio" name="color" value={c} defaultChecked={value === c} className="sr-only" aria-label={`Warna ${c}`} />
            <span className="swatch" data-ph={c} style={{ background: "var(--c)" }} />
          </label>
        ))}
      </div>
    </fieldset>
  );
}

export function Badges({ item, today }: { item: Item; today: string }) {
  return (
    <span className="inline-flex flex-wrap gap-1">
      {item.hardDeadline && <span className="tag tag-danger">Hard deadline</span>}
      {isLate(item, today) && <span className="tag tag-danger">Terlambat</span>}
      {slip(item) && <span className="tag tag-warn">{slip(item)} dari baseline</span>}
      {item.internal && <span className="tag">Internal</span>}
    </span>
  );
}

function NotesField({ item }: { item: Item }) {
  return <label><span>Catatan progress</span><textarea name="notes" rows={2} defaultValue={item.notes} /></label>;
}

export type TabId = "detail" | "feedback" | "signoff" | "link" | "comments" | "deps";
type TabCtx = { item: Item; mode: Mode; me?: unknown; feedback: FeedbackPoint[]; attachments: Attachment[]; comments: Comment[]; deps: Dep[] };
/** Tabs that apply to this item; the Drawer renders them, ItemPanel shows the matching section. */
export function itemTabs({ item, mode, me, feedback, attachments, comments, deps }: TabCtx): { id: TabId; label: string }[] {
  const n = (c: number) => (c > 0 ? ` (${c})` : "");
  const open = feedback.filter((p) => p.itemId === item.id && p.status === "open").length;
  const dn = deps.filter((d) => d.itemId === item.id || d.dependsOnId === item.id).length;
  return [
    { id: "detail" as const, label: "Detail" },
    ...(me ? [{ id: "feedback" as const, label: `Feedback${open ? ` (${open} open)` : ""}` }] : []),
    ...(item.parentId && me ? [{ id: "signoff" as const, label: "Persetujuan" }] : []),
    { id: "link" as const, label: `Link${n(attachments.length)}` },
    ...(mode !== "view" && me ? [{ id: "comments" as const, label: `Komentar${n(comments.length)}` }] : []),
    { id: "deps" as const, label: `Dependency${n(dn)}` },
  ];
}

/** Pinned drawer header: dates, duration, status, owner, badges and (edit mode) one-day steppers. */
export function ItemHead({ item, mode, today, cal, signoffs, onStatus, onStep }: {
  item: Item; mode: Mode; today: string; cal: Cal; signoffs: Signoff[];
  onStatus: (status: string) => void; onStep: (kind: "start" | "due" | "move", dir: 1 | -1) => void;
}) {
  const signed = signoffs.filter((x) => x.itemId === item.id && !x.revokedAt).map((x) => x.signerRole || x.signerName).filter(Boolean).join(", ");
  const kinds = [...(item.parentId ? [] : [["Mulai", "start", "minus", "plus"], ["Selesai", "due", "minus", "plus"]] as const), ["Geser", "move", "left", "chevron"]] as const;
  return (
    <>
      <div className="range">{fmtRange(item.startDate, item.dueDate)}</div>
      {!item.parentId && <div className="muted text-sm tabular-nums" data-testid="duration">{durationLabel(cal, item.startDate, item.dueDate, item.workHours)}</div>}
      <div className="flex flex-wrap items-center gap-1.5 text-sm">
        {mode === "view" ? <span className="status" data-status={item.status}>{statusLabel(item.status)}</span> : (
          <select aria-label={`Status ${item.name}`} className="status-select" data-status={item.status} value={item.status} onChange={(e) => onStatus(e.target.value)}>{STATUSES.map((s) => <option key={s.value} value={s.value}>{s.label}</option>)}</select>
        )}
        {item.picName && <span className="tag">PIC {item.picName}</span>}
        {!item.picName && item.picGroupName && <span className="tag">Dept {item.picGroupName}</span>}
        <Badges item={item} today={today} />
        {item.parentId && signed && <span className="tag">Disetujui oleh {signed}</span>}
      </div>
      {slip(item) && <div className="muted text-xs">Baseline: {fmtRange(item.baselineStart, item.baselineDue)}</div>}
      {mode === "edit" && (
        <div role="toolbar" aria-label={`Atur jadwal "${item.name}"`} className="flex flex-wrap items-center gap-x-3 text-sm">
          {kinds.map(([label, kind, back, fwd]) => (
            <span key={kind} role="group" aria-label={label} className="step-group">
              <span aria-hidden>{label}</span>
              <button type="button" className="btn-ghost btn-icon" aria-label={`${label} mundur satu hari kerja`} onClick={() => onStep(kind, -1)}><Icon name={back} /></button>
              <button type="button" className="btn-ghost btn-icon" aria-label={`${label} maju satu hari kerja`} onClick={() => onStep(kind, 1)}><Icon name={fwd} /></button>
            </span>
          ))}
        </div>
      )}
    </>
  );
}

type ItemProps = {
  item: Item; track: Track; mode: Mode; slug: string; today: string;
  allItems: (Item & { trackName: string })[]; deps: Dep[]; contacts: { id: string; label: string }[]; groups: { id: string; name: string }[];
  onLink: (itemId: string, dependsOnId: string) => void; onUnlink: (itemId: string, dependsOnId: string) => void;
  attachments: Attachment[]; comments: Comment[]; feedback: FeedbackPoint[]; signoffs?: Signoff[]; me?: { id: string; role: string };
  cal: Cal; cascade: boolean; ph: number; onAddMilestone: () => void; drives?: DriveSummary; tab: TabId;
};

export function ItemPanel({ item, mode, slug, today, allItems, deps, contacts, groups, onLink, onUnlink, attachments, comments, feedback, signoffs = [], me, cal, cascade, onAddMilestone, drives, tab }: ItemProps) {
  const stones = allItems.filter((o) => o.parentId === item.id);
  const nameOf = (id: string) => { const i = allItems.find((x) => x.id === id); return i ? `${i.trackName} / ${i.name}` : "—"; };
  const preds = deps.filter((d) => d.itemId === item.id);
  const succs = deps.filter((d) => d.dependsOnId === item.id);
  const linkable = allItems.filter((o) => o.id !== item.id && !preds.some((d) => d.dependsOnId === o.id));
  const hidden = (<><input type="hidden" name="slug" value={slug} /><input type="hidden" name="itemId" value={item.id} /></>);

  const tabs = itemTabs({ item, mode, me, feedback, attachments, comments, deps });
  const t = tabs.some((x) => x.id === tab) ? tab : "detail";

  return (
    <>
      {t === "detail" && (
        <>
          {mode === "edit" && (
            <form key={`${item.id}:${item.startDate}:${item.dueDate}:${item.workHours}`} action={updateItemAction} className="space-y-3">
              {hidden}
              <label><span>Nama</span><input name="name" required defaultValue={item.name} /></label>
              {item.parentId ? (
                <MilestoneDate value={item.startDate} cal={cal} />
              ) : (
                <PhaseDates cal={cal} start={item.startDate} due={item.dueDate} workHours={item.workHours} />
              )}
              <input type="hidden" name="status" value={item.status} />
              <NotesField item={item} />
              <label>
                <span>PIC</span>
                <select name="picContactId" defaultValue={item.picContactId ?? ""}>
                  <option value="">—</option>
                  {contacts.map((c) => <option key={c.id} value={c.id}>{c.label}</option>)}
                </select>
              </label>
              <label>
                <span>Departemen</span>
                <select name="picGroupId" defaultValue={item.picGroupId ?? ""}>
                  <option value="">—</option>
                  {groups.map((g) => <option key={g.id} value={g.id}>{g.name}</option>)}
                </select>
              </label>
              <label className="check"><input type="checkbox" name="hardDeadline" defaultChecked={item.hardDeadline} /> Hard deadline (tidak ikut bergeser)</label>
              <label className="check"><input type="checkbox" name="internal" defaultChecked={item.internal} /> Internal (tidak tampil di link view-only)</label>
              <ColorField value={item.color} />
              <label><span>Alasan perubahan tanggal (opsional)</span><input name="reason" /></label>
              {succs.length > 0 && <label className="check"><input type="checkbox" name="cascade" defaultChecked={cascade} /> Jika tanggal berubah, geser juga {succs.length} item yang menunggu</label>}
              <div className="drawer-foot">
                <button className="btn">Simpan</button>
                <ConfirmButton formAction={deleteItemAction} formNoValidate message={`Hapus "${item.name}"${item.parentId ? "" : " beserta milestone-nya"}?`}>Hapus</ConfirmButton>
              </div>
            </form>
          )}

          {mode === "status" && (
            <form key={`${item.id}:${item.status}`} action={setStatusAction} className="space-y-3">
              {hidden}
              <input type="hidden" name="status" value={item.status} />
              <NotesField item={item} />
              <button className="btn">Simpan status</button>
            </form>
          )}

          {mode === "view" && item.notes && <p className="text-sm whitespace-pre-wrap">{item.notes}</p>}

          {!item.parentId && (
            <section className="space-y-2 text-sm">
              <div className="flex items-center justify-between">
                <h3>Milestone {stones.length > 0 && `(${stones.length})`}</h3>
                {mode === "edit" && <button type="button" className="btn-ghost !min-h-6 text-xs" onClick={onAddMilestone}><Icon name="plus" /> Milestone</button>}
              </div>
              {stones.length === 0 ? <p className="muted">Belum ada. Milestone adalah satu tanggal di dalam fase, misalnya preview atau sesi review.</p> : (
                <ul className="rows">
                  {stones.map((m) => (
                    <li key={m.id} className="flex items-center justify-between gap-3 py-1.5">
                      <span className={m.status === "done" ? "text-muted line-through" : ""}>{m.name}</span>
                      <span className={`shrink-0 text-xs tabular-nums ${isLate(m, today) ? "text-danger" : "text-muted"}`}>{fmtDate(m.startDate)}</span>
                    </li>
                  ))}
                </ul>
              )}
            </section>
          )}

          {!item.parentId && drives && /ingest|backup|data|dailies/i.test(item.name) && (
            <section className="text-sm">
              <h3>Drive (drive-tracker)</h3>
              {drives.state === "ok" ? (
                <p className="num text-ink-2">Keluar {drives.outstanding} · Tersedia {drives.byStatus.available} · Selesai {drives.byStatus.completed} · Arsip {drives.byStatus.archived} · Rusak {drives.byStatus.damaged} · Backup {drives.backupDrives}</p>
              ) : <p className="muted">Belum terhubung{drives.state === "unavailable" ? `: ${drives.reason}` : "."}</p>}
            </section>
          )}
        </>
      )}

      {t === "link" && (
        <section className="space-y-2">
          <h3>Link & versi</h3>
          <AttachmentList attachments={attachments} target={{ type: "schedule_item", id: item.id }} slug={slug} canEdit={mode !== "view"} canApprove={mode === "edit"} labelOptions={LINK_LABELS} />
        </section>
      )}

      {t === "feedback" && me && <FeedbackPanel item={item} allItems={allItems} points={feedback} mode={mode} slug={slug} />}

      {t === "signoff" && me && <SignoffPanel item={item} signoffs={signoffs} mode={mode} slug={slug} />}

      {t === "comments" && me && (
        <section className="space-y-2">
          <h3>Komentar {comments.length > 0 && `(${comments.length})`}</h3>
          <CommentThread comments={comments} target={{ type: "schedule_item", id: item.id }} slug={slug} me={me} />
        </section>
      )}

      {t === "deps" && (
        <section className="space-y-2 text-sm">
        <h3>Menunggu</h3>
        {preds.length === 0 && <p className="muted">Tidak menunggu item lain.</p>}
        <ul className="space-y-1">
          {preds.map((d) => (
            <li key={d.dependsOnId} className="flex items-center justify-between gap-2">
              <span>{nameOf(d.dependsOnId)}</span>
              {mode === "edit" && <button type="button" className="btn-danger" onClick={() => onUnlink(item.id, d.dependsOnId)}>Lepas</button>}
            </li>
          ))}
        </ul>
        {mode === "edit" && linkable.length > 0 && (
          <form className="flex items-end gap-2" onSubmit={(e) => { e.preventDefault(); const v = new FormData(e.currentTarget).get("dep"); if (v) onLink(item.id, String(v)); }}>
            <label className="min-w-0 flex-1">
              <span>Tambah dependency</span>
              <select name="dep" defaultValue="" required>
                <option value="" disabled>Item ini menunggu…</option>
                {linkable.map((o) => <option key={o.id} value={o.id}>{o.trackName} / {o.name}</option>)}
              </select>
            </label>
            <button className="btn-secondary">Tambah</button>
          </form>
        )}
        {succs.length > 0 && (
          <>
            <h3 className="pt-2">Ditunggu oleh</h3>
            <ul className="space-y-1">{succs.map((d) => <li key={d.itemId}>{nameOf(d.itemId)}</li>)}</ul>
          </>
        )}
        </section>
      )}
    </>
  );
}

/** Adds a phase (a period) or a milestone (one date inside a phase) by hand; names are suggestions only. */
export function NewItemPanel({ slug, tracks, trackId, parentId, date, cal }: { slug: string; tracks: Track[]; trackId: string; parentId: string | null; date: string; cal: Cal }) {
  const [track, setTrack] = useState(trackId);
  const [parent, setParent] = useState(parentId ?? "");
  const [kind, setKind] = useState<"phase" | "milestone">(parentId ? "milestone" : "phase");
  const phases = tracks.find((t) => t.id === track)?.items.filter((i) => !i.parentId) ?? [];
  const start = snap(cal, date);
  const milestone = kind === "milestone";
  return (
    <form action={addItemAction} className="space-y-3">
      <input type="hidden" name="slug" value={slug} />
      <div role="group" aria-label="Jenis item" className="seg">
        <button type="button" aria-pressed={!milestone} onClick={() => setKind("phase")}>Fase (periode)</button>
        <button type="button" aria-pressed={milestone} disabled={phases.length === 0} onClick={() => setKind("milestone")}>Milestone (satu tanggal)</button>
      </div>
      <label>
        <span>Track</span>
        <select name="trackId" value={track} onChange={(e) => { setTrack(e.target.value); setParent(""); }}>{tracks.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}</select>
      </label>
      {milestone && (
        <label>
          <span>Di dalam fase</span>
          <select name="parentId" required value={parent} onChange={(e) => setParent(e.target.value)}>
            <option value="" disabled>Pilih fase…</option>
            {phases.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
          </select>
        </label>
      )}
      <label>
        <span>Nama</span>
        <input name="name" required autoFocus list="item-names" placeholder={milestone ? "Mis. Test DCP, Preview 3" : "Mis. Subtitling, DCP Mastering"} autoComplete="off" />
        <datalist id="item-names">{(milestone ? MILESTONE_NAME_OPTIONS : PHASE_NAME_OPTIONS).map((n) => <option key={n} value={n} />)}</datalist>
      </label>
      {milestone ? <MilestoneDate value={start} cal={cal} /> : (
        <>
          <PhaseDates cal={cal} start={start} due={snap(cal, addDays(start, 6), -1)} workHours={null} />
          <ColorField value={null} />
        </>
      )}
      <button className="btn">Tambah {milestone ? "milestone" : "fase"}</button>
    </form>
  );
}

export function ManagePanel({ slug, tracks, today, hasItems, onOpen }: { slug: string; tracks: Track[]; today: string; hasItems: boolean; onOpen: (panel: "days" | "versions" | "template") => void }) {
  const toast = useToast();
  return (
    <>
      <form action={addTrackAction} className="space-y-3">
        <input type="hidden" name="slug" value={slug} />
        <h3>Track baru</h3>
        <label>
          <span>Template fase</span>
          <select name="template">{TRACK_TEMPLATES.map((t) => <option key={t.value} value={t.value}>{t.label}{t.phases.length ? ` (${t.phases.length} fase, ${t.phases.reduce((n, p) => n + (p.milestones?.length ?? 0), 0)} milestone)` : ""}</option>)}</select>
        </label>
        <label>
          <span>Nama track</span>
          <input name="name" list="track-names" placeholder="Kosongkan untuk nama bawaan template" />
          <datalist id="track-names">{TRACK_NAME_OPTIONS.map((n) => <option key={n} value={n} />)}</datalist>
        </label>
        <label><span>Tanggal mulai</span><input name="startDate" type="date" defaultValue={today} /></label>
        <button className="btn">Tambah track</button>
      </form>

      <section className="space-y-2 hairline pt-4">
        <h3>Rencana mundur dari tanggal rilis</h3>
        <p className="muted text-sm">Terapkan template dengan menghitung mundur dari tanggal rilis, lengkap dengan pratinjau dan saran pemadatan.</p>
        <button type="button" className="btn-secondary" onClick={() => onOpen("template")}>Buka</button>
      </section>

      {tracks.some((t) => t.items.length > 0) && (
        <form className="space-y-3 hairline pt-4" action={async (f) => {
          const r = await saveTemplateAction(slug, String(f.get("name") ?? ""), f.getAll("trackIds").map(String));
          toast(r.ok ? { message: "Template disimpan." } : { message: r.error, tone: "error" });
        }}>
          <h3>Simpan sebagai template</h3>
          <p className="muted text-sm">Hanya struktur yang disimpan: durasi, urutan, milestone, warna, departemen. Tanggal, status, dan PIC tidak ikut.</p>
          <label><span>Nama template</span><input name="name" required /></label>
          <fieldset className="space-y-1">
            <legend className="mb-1 text-xs font-semibold text-ink-2">Track</legend>
            {tracks.map((t) => <label key={t.id} className="check"><input type="checkbox" name="trackIds" value={t.id} defaultChecked /> {t.name}</label>)}
          </fieldset>
          <button className="btn-secondary">Simpan template</button>
        </form>
      )}

      {hasItems && (
        <section className="space-y-2 hairline pt-4">
          <h3>Export</h3>
          <div className="flex flex-wrap gap-2">
            <a className="btn-secondary" href={`/admin/p/${slug}/timeline/print`}><Icon name="print" /> PDF Gantt</a>
            <a className="btn-secondary" href={`/admin/p/${slug}/timeline/print?view=calendar`}><Icon name="today" /> PDF Kalender</a>
            <a className="btn-secondary" href={`/admin/p/${slug}/timeline/export`} download><Icon name="download" /> Excel / Sheets (CSV)</a>
            <a className="btn-secondary" href={`/admin/p/${slug}/timeline/export?type=feedback`} download><Icon name="feedback" /> Feedback (CSV)</a>
          </div>
        </section>
      )}

      <section className="space-y-2 hairline pt-4">
        <h3>Versi tersimpan</h3>
        <p className="muted text-sm">Simpan dan pulihkan keadaan timeline dari tombol Versi di atas jadwal.</p>
        <button type="button" className="btn-secondary" onClick={() => onOpen("versions")}>Buka Versi</button>
      </section>

      <section className="space-y-2 hairline pt-4">
        <h3>Hari kerja & libur</h3>
        <p className="muted text-sm">Atur hari yang diblokir dan lihat daftar hari liburnya.</p>
        <button type="button" className="btn-secondary" onClick={() => onOpen("days")}>Buka Hari kerja & libur</button>
      </section>

      {hasItems && (
        <form action={rebaselineAction} className="space-y-3 hairline pt-4">
          <input type="hidden" name="slug" value={slug} />
          <h3>Baseline</h3>
          <p className="muted text-sm">Menetapkan jadwal saat ini sebagai baseline baru. Selisih “dari baseline” di semua item kembali nol.</p>
          <label><span>Alasan (opsional)</span><input name="reason" /></label>
          <ConfirmButton className="btn-secondary" message="Tetapkan jadwal saat ini sebagai baseline baru?">Set baseline</ConfirmButton>
        </form>
      )}

      {tracks.length > 0 && (
        <section className="space-y-2 hairline pt-4">
          <h3>Hapus track</h3>
          {tracks.map((t) => (
            <form key={t.id} action={deleteTrackAction} className="flex items-center justify-between gap-2 text-sm">
              <input type="hidden" name="slug" value={slug} /><input type="hidden" name="trackId" value={t.id} />
              <span>{t.name} <span className="muted">· {t.items.length} item</span></span>
              <ConfirmButton message={`Hapus track "${t.name}" beserta ${t.items.length} item di dalamnya?`}>Hapus</ConfirmButton>
            </form>
          ))}
        </section>
      )}
    </>
  );
}

export function AgendaList({ tracks, today, onOpen, ph }: { tracks: Track[]; today: string; onOpen: (id: string) => void; ph: (id: string) => number }) {
  return (
    <div className="space-y-4">
      {tracks.map((t) => (
        <section key={t.id}>
          <h2 className="section-band">{t.name}</h2>
          <ul className="rows">
            {t.items.map((i) => (
              <li key={i.id}>
                <button type="button" className={`flex min-h-11 w-full cursor-pointer items-center gap-3 rounded-lg px-2 py-2.5 text-left transition-colors duration-100 hover:bg-raised active:bg-raised ${i.parentId ? "pl-6" : ""}`} onClick={() => onOpen(i.id)}>
                  <span aria-hidden className={i.parentId ? "diamond" : "ph-mark"} data-ph={ph(i.id)} />
                  <span className="min-w-0 flex-1">
                    <span className="font-medium">{i.name}</span>
                    <span className="block text-[13px] text-ink-2">{fmtRange(i.startDate, i.dueDate)} · {statusLabel(i.status)}{i.picName && ` · ${i.picName}`}</span>
                  </span>
                  <span className="shrink-0 text-right text-xs">
                    <span className={isLate(i, today) ? "text-danger" : "font-semibold text-ink-2"}>{fmtDate(i.dueDate).replace(/ \d{4}$/, "")}</span>
                    {slip(i) && <span className="block text-warn">{slip(i)}</span>}
                  </span>
                </button>
              </li>
            ))}
          </ul>
        </section>
      ))}
    </div>
  );
}
