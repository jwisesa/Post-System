import { fmtDate } from "@/lib/schedule/dates";
import { formatBytes, type DriveSummary } from "@/lib/drive-tracker/service";
import { ListHead } from "./TodayCards";
import { linkDriveTrackerAction } from "@/app/admin/actions";

type Opt = { id: string; name: string };

/** Read-only drive-tracker summary; supervisors also get the link form. */
export function DriveCard({ summary, slug, options, linkedId, canEdit }: { summary: DriveSummary; slug: string; options: Opt[]; linkedId: string | null; canEdit: boolean }) {
  if (summary.state === "unlinked" && !canEdit) return null;
  const form = canEdit && (
    <form action={linkDriveTrackerAction} className="mt-2 flex flex-wrap items-center gap-2">
      <input type="hidden" name="slug" value={slug} />
      <select name="dtProjectId" defaultValue={linkedId ?? ""} aria-label="Project drive-tracker" className="min-w-0 max-w-full">
        <option value="" disabled>Pilih project drive-tracker</option>
        {options.map((o) => <option key={o.id} value={o.id}>{o.name}</option>)}
      </select>
      <button className="btn">Simpan</button>
      {linkedId && <button className="btn-ghost" name="unlink" value="1" formNoValidate>Putuskan</button>}
    </form>
  );
  return (
    <section>
      <ListHead title="Drive (drive-tracker)" />
      {summary.state === "unlinked" && <p className="py-1 text-[13px] text-ink-2">Belum terhubung ke drive-tracker.</p>}
      {summary.state === "unavailable" && <p className="muted py-1 text-[13px]">Belum terhubung: {summary.reason}</p>}
      {summary.state === "ok" && (
        <div className="py-1 text-[13px]">
          <div className="font-semibold">{summary.project.name} <span className="muted font-normal">· {summary.total} drive · {formatBytes(summary.totalBytes)}</span></div>
          <div className="num text-ink-2">
            Keluar {summary.outstanding} · Tersedia {summary.byStatus.available} · Selesai {summary.byStatus.completed} · Arsip {summary.byStatus.archived} · Rusak {summary.byStatus.damaged}
          </div>
          <div className="text-ink-2">Drive backup {summary.backupDrives}{summary.lastUpdate && ` · isi diperbarui ${fmtDate(summary.lastUpdate.slice(0, 10))}`}</div>
        </div>
      )}
      {form}
    </section>
  );
}
