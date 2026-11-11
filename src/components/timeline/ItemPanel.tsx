"use client";

import { addItemAction, addTrackAction, deleteItemAction, deleteTrackAction, rebaselineAction, setStatusAction, updateItemAction } from "@/app/admin/schedule-actions";
import { fmtDate, fmtRange } from "@/lib/schedule/dates";
import type { Dep } from "@/lib/schedule/shift";
import { STATUSES, statusLabel, TRACK_NAME_OPTIONS, TRACK_TEMPLATES } from "@/lib/schedule/templates";
import { ConfirmButton } from "../ui/controls";
import { isLate, slip, type Item, type Mode, type Track } from "./shared";

export function Badges({ item, today }: { item: Item; today: string }) {
  return (
    <span className="inline-flex flex-wrap gap-1">
      {item.hardDeadline && <span className="tag tag-danger">Hard deadline</span>}
      {isLate(item, today) && <span className="tag tag-danger">Terlambat</span>}
      {slip(item) && <span className="tag tag-warn">{slip(item)} dari baseline</span>}
      {item.internal && <span className="tag tag-warn">Internal</span>}
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
};

export function ItemPanel({ item, track, mode, slug, today, allItems, deps, contacts, onLink, onUnlink }: ItemProps) {
  const nameOf = (id: string) => { const i = allItems.find((x) => x.id === id); return i ? `${i.trackName} / ${i.name}` : "—"; };
  const preds = deps.filter((d) => d.itemId === item.id);
  const succs = deps.filter((d) => d.dependsOnId === item.id);
  const linkable = allItems.filter((o) => o.id !== item.id && !preds.some((d) => d.dependsOnId === o.id));
  const hidden = (<><input type="hidden" name="slug" value={slug} /><input type="hidden" name="itemId" value={item.id} /></>);

  return (
    <>
      <div className="space-y-1.5 text-sm">
        <div className="muted">{track.name}{item.parentId ? " · milestone" : ""}</div>
        <div className="font-medium">{fmtRange(item.startDate, item.dueDate)}</div>
        <div className="flex flex-wrap items-center gap-1.5">
          <span className="tag"><span className="size-2 rounded-full" style={{ background: `var(--st-${item.status})` }} />{statusLabel(item.status)}</span>
          {item.picName && <span className="tag">PIC {item.picName}</span>}
          <Badges item={item} today={today} />
        </div>
        {slip(item) && <div className="muted text-xs">Baseline: {fmtRange(item.baselineStart, item.baselineDue)}</div>}
      </div>

      {mode === "edit" && (
        <form key={`${item.id}:${item.startDate}:${item.dueDate}:${item.status}`} action={updateItemAction} className="space-y-3 border-t border-line pt-4">
          {hidden}
          <label><span>Nama</span><input name="name" required defaultValue={item.name} /></label>
          <div className="grid grid-cols-2 gap-3">
            <label><span>Mulai</span><input name="startDate" type="date" required defaultValue={item.startDate} /></label>
            <label><span>Due date</span><input name="dueDate" type="date" required defaultValue={item.dueDate} /></label>
          </div>
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
          <label><span>Alasan perubahan tanggal (opsional)</span><input name="reason" /></label>
          <p className="muted text-xs">Jika tanggal berubah dan ada item yang bergantung, dampaknya ditampilkan dulu sebelum disimpan.</p>
          <div className="flex items-center gap-2">
            <button className="btn">Simpan</button>
            <ConfirmButton formAction={deleteItemAction} formNoValidate message={`Hapus "${item.name}"${item.parentId ? "" : " beserta milestone-nya"}?`}>Hapus</ConfirmButton>
          </div>
        </form>
      )}

      {mode === "status" && (
        <form key={`${item.id}:${item.status}`} action={setStatusAction} className="space-y-3 border-t border-line pt-4">
          {hidden}
          <StatusFields item={item} />
          <button className="btn">Simpan status</button>
        </form>
      )}

      {mode !== "edit" && item.notes && mode === "view" && <p className="border-t border-line pt-4 text-sm whitespace-pre-wrap">{item.notes}</p>}

      <section className="space-y-2 border-t border-line pt-4 text-sm">
        <h3 className="text-xs font-medium text-muted">Menunggu</h3>
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
            <h3 className="pt-2 text-xs font-medium text-muted">Ditunggu oleh</h3>
            <ul className="space-y-1">{succs.map((d) => <li key={d.itemId}>{nameOf(d.itemId)}</li>)}</ul>
          </>
        )}
      </section>

      {mode === "edit" && !item.parentId && (
        <form action={addItemAction} className="space-y-3 border-t border-line pt-4">
          <input type="hidden" name="slug" value={slug} /><input type="hidden" name="trackId" value={track.id} /><input type="hidden" name="parentId" value={item.id} />
          <h3 className="text-xs font-medium text-muted">Milestone baru di fase ini</h3>
          <div className="grid grid-cols-[1fr_9.5rem] gap-3">
            <label><span>Nama</span><input name="name" required placeholder="Mis. Cut v2 ke director" /></label>
            <label><span>Tanggal</span><input name="startDate" type="date" required defaultValue={item.dueDate} min={item.startDate} /></label>
          </div>
          <button className="btn-secondary">Tambah milestone</button>
        </form>
      )}
    </>
  );
}

export function NewPhasePanel({ slug, track, date, endDate }: { slug: string; track: Track; date: string; endDate: string }) {
  return (
    <form action={addItemAction} className="space-y-3">
      <input type="hidden" name="slug" value={slug} /><input type="hidden" name="trackId" value={track.id} />
      <p className="muted text-sm">Track: {track.name}</p>
      <label><span>Nama fase</span><input name="name" required autoFocus /></label>
      <div className="grid grid-cols-2 gap-3">
        <label><span>Mulai</span><input name="startDate" type="date" required defaultValue={date} /></label>
        <label><span>Due date</span><input name="dueDate" type="date" required defaultValue={endDate} /></label>
      </div>
      <button className="btn">Tambah fase</button>
    </form>
  );
}

export function ManagePanel({ slug, tracks, today, hasItems }: { slug: string; tracks: Track[]; today: string; hasItems: boolean }) {
  return (
    <>
      <form action={addTrackAction} className="space-y-3">
        <input type="hidden" name="slug" value={slug} />
        <h3 className="font-medium">Track baru</h3>
        <label>
          <span>Template fase</span>
          <select name="template">{TRACK_TEMPLATES.map((t) => <option key={t.value} value={t.value}>{t.label}{t.phases.length ? ` (${t.phases.length} fase)` : ""}</option>)}</select>
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
        <form action={rebaselineAction} className="space-y-3 border-t border-line pt-4">
          <input type="hidden" name="slug" value={slug} />
          <h3 className="font-medium">Baseline</h3>
          <p className="muted text-sm">Menetapkan jadwal saat ini sebagai baseline baru. Selisih “dari baseline” di semua item kembali nol.</p>
          <label><span>Alasan (opsional)</span><input name="reason" /></label>
          <ConfirmButton className="btn-secondary" message="Tetapkan jadwal saat ini sebagai baseline baru?">Set baseline</ConfirmButton>
        </form>
      )}

      {tracks.length > 0 && (
        <section className="space-y-2 border-t border-line pt-4">
          <h3 className="font-medium">Hapus track</h3>
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

export function AgendaList({ tracks, today, onOpen }: { tracks: Track[]; today: string; onOpen: (id: string) => void }) {
  return (
    <div className="space-y-4">
      {tracks.map((t) => (
        <section key={t.id} className="card p-0">
          <h2 className="border-b border-line px-4 py-2.5">{t.name}</h2>
          <ul className="divide-y divide-line">
            {t.items.map((i) => (
              <li key={i.id}>
                <button type="button" className={`flex w-full cursor-pointer items-center gap-3 px-4 py-2.5 text-left hover:bg-raised ${i.parentId ? "pl-8" : ""}`} onClick={() => onOpen(i.id)}>
                  <span className="size-2.5 shrink-0 rounded-full" style={{ background: `var(--st-${i.status})` }} />
                  <span className="min-w-0 flex-1">
                    <span className="font-medium">{i.name}</span>
                    <span className="muted block text-xs">{fmtRange(i.startDate, i.dueDate)}{i.picName && ` · ${i.picName}`}</span>
                  </span>
                  <span className="shrink-0 text-right text-xs">
                    <span className={isLate(i, today) ? "text-danger" : "muted"}>{fmtDate(i.dueDate).replace(/ \d{4}$/, "")}</span>
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
