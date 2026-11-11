import { ItemBadges, ScheduleView } from "@/components/schedule-view";
import { ErrorBanner } from "@/components/views";
import { can } from "@/lib/auth/permissions";
import { loadProject } from "@/lib/project-context";
import { fmtRange, today as todayWib } from "@/lib/schedule/dates";
import { getSchedule } from "@/lib/schedule/service";
import { STATUSES, statusLabel, TRACK_NAME_OPTIONS, TRACK_TEMPLATES } from "@/lib/schedule/templates";
import { getTeam } from "@/lib/services";
import {
  addDependencyAction, addItemAction, addTrackAction, deleteItemAction, deleteTrackAction,
  rebaselineAction, removeDependencyAction, setStatusAction, updateItemAction,
} from "../../../schedule-actions";

function StatusFields({ status, notes }: { status: string; notes: string }) {
  return (
    <>
      <label>
        <span>Status</span>
        <select name="status" defaultValue={status}>
          {STATUSES.map((s) => <option key={s.value} value={s.value}>{s.label}</option>)}
        </select>
      </label>
      <label className="md:col-span-2"><span>Catatan progress</span><input name="notes" defaultValue={notes} /></label>
    </>
  );
}

export default async function Timeline({ params, searchParams }: { params: Promise<{ slug: string }>; searchParams: Promise<{ error?: string }> }) {
  const { slug } = await params;
  const { error } = await searchParams;
  const { db, project, role } = await loadProject(slug);
  const [schedule, team] = await Promise.all([getSchedule(db, project.id, { includeInternal: true }), getTeam(db, project.id, { includeInternal: true })]);
  const canEdit = can(role, "schedule.edit");
  const canStatus = can(role, "schedule.status");
  const today = todayWib();
  const allItems = schedule.tracks.flatMap((t) => t.items.map((i) => ({ ...i, trackName: t.name })));
  const nameOf = new Map(allItems.map((i) => [i.id, `${i.trackName} / ${i.name}`]));
  const contacts = team.flatMap((g) => g.contacts.map((c) => ({ id: c.id, label: `${c.name} (${g.name})` })));
  const slugField = <input type="hidden" name="slug" value={slug} />;

  return (
    <>
      <ErrorBanner message={error} />
      <ScheduleView schedule={schedule} />

      {schedule.tracks.map((t) => (
        <section key={t.id} className="card space-y-2">
          <div className="flex items-center justify-between">
            <h2>{t.name}</h2>
            {canEdit && (
              <form action={deleteTrackAction}>
                {slugField}<input type="hidden" name="trackId" value={t.id} />
                <button className="btn-quiet">Hapus track</button>
              </form>
            )}
          </div>
          {t.items.map((i) => {
            const preds = schedule.deps.filter((d) => d.itemId === i.id);
            return (
              <details key={i.id} className={`border-t border-neutral-100 pt-2 ${i.parentId ? "ml-5" : ""}`}>
                <summary>
                  <span className="text-neutral-900">{i.parentId ? "◆ " : ""}{i.name}</span>{" "}
                  <span className="text-neutral-500">{fmtRange(i.startDate, i.dueDate)} · {statusLabel(i.status)}{i.picName && ` · PIC ${i.picName}`}</span>{" "}
                  <ItemBadges item={i} today={today} />
                </summary>
                {canEdit ? (
                  <div className="mt-2 space-y-3">
                    <form action={updateItemAction} className="grid gap-2 md:grid-cols-3">
                      {slugField}<input type="hidden" name="itemId" value={i.id} />
                      <label><span>Nama</span><input name="name" required defaultValue={i.name} /></label>
                      <label><span>Mulai</span><input name="startDate" type="date" required defaultValue={i.startDate} /></label>
                      <label><span>Due date</span><input name="dueDate" type="date" required defaultValue={i.dueDate} /></label>
                      <StatusFields status={i.status} notes={i.notes} />
                      <label>
                        <span>PIC</span>
                        <select name="picContactId" defaultValue={i.picContactId ?? ""}>
                          <option value="">—</option>
                          {contacts.map((c) => <option key={c.id} value={c.id}>{c.label}</option>)}
                        </select>
                      </label>
                      <label className="md:col-span-2"><span>Alasan perubahan tanggal (opsional)</span><input name="reason" /></label>
                      <div className="flex flex-wrap items-center gap-x-4 gap-y-1 md:col-span-3">
                        <label className="flex items-center gap-1"><input type="checkbox" name="hardDeadline" defaultChecked={i.hardDeadline} /> Hard deadline (tidak ikut bergeser)</label>
                        <label className="flex items-center gap-1"><input type="checkbox" name="internal" defaultChecked={i.internal} /> Internal</label>
                        <button className="btn">Simpan</button>
                        <button formAction={deleteItemAction} formNoValidate className="btn-quiet">Hapus</button>
                      </div>
                    </form>
                    <div className="text-sm">
                      <span className="text-xs font-medium text-neutral-600">Menunggu: </span>
                      {preds.length === 0 && <span className="text-neutral-500">tidak ada</span>}
                      {preds.map((d) => (
                        <form key={d.dependsOnId} action={removeDependencyAction} className="mr-2 inline">
                          {slugField}<input type="hidden" name="itemId" value={i.id} /><input type="hidden" name="dependsOnId" value={d.dependsOnId} />
                          <span className="tag">{nameOf.get(d.dependsOnId)} <button className="cursor-pointer text-red-700" title="Lepas dependency">×</button></span>
                        </form>
                      ))}
                      <form action={addDependencyAction} className="mt-1 flex items-end gap-2">
                        {slugField}<input type="hidden" name="itemId" value={i.id} />
                        <label className="flex-1">
                          <span>Tambah dependency (item ini menunggu…)</span>
                          <select name="dependsOnId" required defaultValue="">
                            <option value="" disabled>Pilih item</option>
                            {allItems.filter((o) => o.id !== i.id && !preds.some((d) => d.dependsOnId === o.id)).map((o) => <option key={o.id} value={o.id}>{o.trackName} / {o.name}</option>)}
                          </select>
                        </label>
                        <button className="btn">Tambah</button>
                      </form>
                    </div>
                    {!i.parentId && (
                      <form action={addItemAction} className="flex items-end gap-2">
                        {slugField}<input type="hidden" name="trackId" value={t.id} /><input type="hidden" name="parentId" value={i.id} />
                        <label className="flex-1"><span>Milestone baru di fase ini</span><input name="name" required placeholder="Mis. Cut v2 ke director" /></label>
                        <label><span>Tanggal</span><input name="startDate" type="date" required defaultValue={i.dueDate} /></label>
                        <button className="btn">Tambah milestone</button>
                      </form>
                    )}
                  </div>
                ) : canStatus ? (
                  <form action={setStatusAction} className="mt-2 grid items-end gap-2 md:grid-cols-4">
                    {slugField}<input type="hidden" name="itemId" value={i.id} />
                    <StatusFields status={i.status} notes={i.notes} />
                    <button className="btn">Simpan status</button>
                  </form>
                ) : (
                  i.notes && <p className="mt-1 text-sm text-neutral-600">{i.notes}</p>
                )}
              </details>
            );
          })}
          {canEdit && (
            <details className="border-t border-neutral-100 pt-2">
              <summary>+ Tambah fase</summary>
              <form action={addItemAction} className="mt-2 grid items-end gap-2 md:grid-cols-4">
                {slugField}<input type="hidden" name="trackId" value={t.id} />
                <label><span>Nama fase</span><input name="name" required /></label>
                <label><span>Mulai</span><input name="startDate" type="date" required /></label>
                <label><span>Due date</span><input name="dueDate" type="date" required /></label>
                <button className="btn">Tambah</button>
              </form>
            </details>
          )}
        </section>
      ))}

      {canEdit && (
        <>
          <form action={addTrackAction} className="card grid items-end gap-2 md:grid-cols-4">
            {slugField}
            <h2 className="md:col-span-4">Track baru</h2>
            <label>
              <span>Nama track</span>
              <input name="name" list="track-names" placeholder="Kosongkan untuk nama bawaan template" />
              <datalist id="track-names">{TRACK_NAME_OPTIONS.map((n) => <option key={n} value={n} />)}</datalist>
            </label>
            <label>
              <span>Template fase</span>
              <select name="template">{TRACK_TEMPLATES.map((tpl) => <option key={tpl.value} value={tpl.value}>{tpl.label}</option>)}</select>
            </label>
            <label><span>Tanggal mulai</span><input name="startDate" type="date" defaultValue={today} /></label>
            <button className="btn">Tambah track</button>
          </form>
          {allItems.length > 0 && (
            <form action={rebaselineAction} className="card flex items-end gap-3">
              {slugField}
              <label className="flex-1"><span>Tetapkan jadwal saat ini sebagai baseline baru — alasan (opsional)</span><input name="reason" /></label>
              <button className="btn">Set baseline</button>
            </form>
          )}
        </>
      )}
    </>
  );
}
