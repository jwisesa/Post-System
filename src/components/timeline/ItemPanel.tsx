"use client";

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
import { ConfirmButton } from "../ui/controls";
import { FeedbackPanel } from "./FeedbackPanel";
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

function StatusFields({ item }: { item: Item }) {
  return (
    <>
      <label>
        <span>Status</span>
        <select name="status" defaultValue={item.status}>{STATUSES.map((s) => <option key={s.value} value={s.value}>{s.label}</option>)}</select>
      </label>
      <label><span>Catatan progress</span><textarea name="notes" rows={2} defaultValue={item.notes} /></label>
    </>
  );
}

type ItemProps = {
  item: Item; track: Track; mode: Mode; slug: string; today: string;
  allItems: (Item & { trackName: string })[]; deps: Dep[]; contacts: { id: string; label: string }[];
  onLink: (itemId: string, dependsOnId: string) => void; onUnlink: (itemId: string, dependsOnId: string) => void;
  attachments: Attachment[]; comments: Comment[]; feedback: FeedbackPoint[]; me?: { id: string; role: string };
  cal: Cal; cascade: boolean; ph: number; onAddMilestone: () => void;
};

export function ItemPanel({ item, track, mode, slug, today, allItems, deps, contacts, onLink, onUnlink, attachments, comments, feedback, me, cal, cascade, ph, onAddMilestone }: ItemProps) {
  const stones = allItems.filter((o) => o.parentId === item.id);
  const nameOf = (id: string) => { const i = allItems.find((x) => x.id === id); return i ? `${i.trackName} / ${i.name}` : "—"; };
  const preds = deps.filter((d) => d.itemId === item.id);
  const succs = deps.filter((d) => d.dependsOnId === item.id);
  const linkable = allItems.filter((o) => o.id !== item.id && !preds.some((d) => d.dependsOnId === o.id));
  const hidden = (<><input type="hidden" name="slug" value={slug} /><input type="hidden" name="itemId" value={item.id} /></>);

  return (
    <>
      <div className="space-y-1.5 text-sm">
        <div className="muted flex items-center gap-2">
          <span aria-hidden className={item.parentId ? "diamond" : "ph-mark"} data-ph={ph} />
          {track.name}{item.parentId ? ` · milestone di ${allItems.find((o) => o.id === item.parentId)?.name ?? "fase"}` : " · fase"}
        </div>
        <div className="font-display text-lg font-semibold tabular-nums">{fmtRange(item.startDate, item.dueDate)}</div>
        {!item.parentId && <div className="muted tabular-nums" data-testid="duration">{durationLabel(cal, item.startDate, item.dueDate, item.workHours)}</div>}
        <div className="flex flex-wrap items-center gap-1.5">
          <span className="status" data-status={item.status}>{statusLabel(item.status)}</span>
          {item.picName && <span className="tag">PIC {item.picName}</span>}
          <Badges item={item} today={today} />
        </div>
        {slip(item) && <div className="muted text-xs">Baseline: {fmtRange(item.baselineStart, item.baselineDue)}</div>}
      </div>

      {!item.parentId && (
        <section className="space-y-2 hairline pt-4 text-sm">
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

      <section className="space-y-2 hairline pt-4">
        <h3>Link & versi</h3>
        <AttachmentList attachments={attachments} target={{ type: "schedule_item", id: item.id }} slug={slug} canEdit={mode !== "view"} canApprove={mode === "edit"} labelOptions={LINK_LABELS} />
      </section>

      {me && <FeedbackPanel item={item} allItems={allItems} points={feedback} mode={mode} slug={slug} />}

      {mode !== "view" && me && (
        <section className="space-y-2 hairline pt-4">
          <h3>Komentar {comments.length > 0 && `(${comments.length})`}</h3>
          <CommentThread comments={comments} target={{ type: "schedule_item", id: item.id }} slug={slug} me={me} />
        </section>
      )}

      {mode === "edit" && (
        <form key={`${item.id}:${item.startDate}:${item.dueDate}:${item.status}:${item.workHours}`} action={updateItemAction} className="space-y-3 hairline pt-4">
          {hidden}
          <label><span>Nama</span><input name="name" required defaultValue={item.name} /></label>
          {item.parentId ? (
            <MilestoneDate value={item.startDate} cal={cal} />
          ) : (
            <PhaseDates cal={cal} start={item.startDate} due={item.dueDate} workHours={item.workHours} />
          )}
          <StatusFields item={item} />
          <label>
            <span>PIC</span>
            <select name="picContactId" defaultValue={item.picContactId ?? ""}>
              <option value="">—</option>
              {contacts.map((c) => <option key={c.id} value={c.id}>{c.label}</option>)}
            </select>
          </label>
          <label className="check"><input type="checkbox" name="hardDeadline" defaultChecked={item.hardDeadline} /> Hard deadline (tidak ikut bergeser)</label>
          <label className="check"><input type="checkbox" name="internal" defaultChecked={item.internal} /> Internal (tidak tampil di link view-only)</label>
          <ColorField value={item.color} />
          <label><span>Alasan perubahan tanggal (opsional)</span><input name="reason" /></label>
          {succs.length > 0 && <label className="check"><input type="checkbox" name="cascade" defaultChecked={cascade} /> Jika tanggal berubah, geser juga {succs.length} item yang menunggu</label>}
          <div className="flex items-center gap-2">
            <button className="btn">Simpan</button>
            <ConfirmButton formAction={deleteItemAction} formNoValidate message={`Hapus "${item.name}"${item.parentId ? "" : " beserta milestone-nya"}?`}>Hapus</ConfirmButton>
          </div>
        </form>
      )}

      {mode === "status" && (
        <form key={`${item.id}:${item.status}`} action={setStatusAction} className="space-y-3 hairline pt-4">
          {hidden}
          <StatusFields item={item} />
          <button className="btn">Simpan status</button>
        </form>
      )}

      {mode !== "edit" && item.notes && mode === "view" && <p className="hairline pt-4 text-sm whitespace-pre-wrap">{item.notes}</p>}

      <section className="space-y-2 hairline pt-4 text-sm">
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

export function ManagePanel({ slug, tracks, today, hasItems, onOpen }: { slug: string; tracks: Track[]; today: string; hasItems: boolean; onOpen: (panel: "days" | "versions") => void }) {
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
