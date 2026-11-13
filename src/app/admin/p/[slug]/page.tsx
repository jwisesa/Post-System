import { headers } from "next/headers";
import Link from "next/link";
import { Icon } from "@/components/ui/icons";
import { ProjectFields } from "@/components/project-fields";
import { CalendarCard } from "@/components/today/CalendarCard";
import { FollowUpList } from "@/components/today/FollowUpList";
import { DeliverablesMeter, ListHead, TodayBoard } from "@/components/today/TodayCards";
import { ErrorBanner, ProjectSummary } from "@/components/views";
import { can } from "@/lib/auth/permissions";
import { getOrCreateCalendarToken } from "@/lib/calendar/service";
import { loadProject } from "@/lib/project-context";
import { today as todayWib } from "@/lib/schedule/dates";
import { getToday } from "@/lib/today/service";
import { listActivity } from "@/lib/services";
import { deleteProjectAction, updateProjectAction } from "../../actions";

export default async function Overview({ params, searchParams }: { params: Promise<{ slug: string }>; searchParams: Promise<{ error?: string }> }) {
  const { slug } = await params;
  const { error } = await searchParams;
  const { db, user, project, role } = await loadProject(slug);
  const today = todayWib();
  const [data, recent, calendarToken, h] = await Promise.all([
    getToday(db, project.id, today, { includeInternal: true, feedback: true }),
    listActivity(db, project.id, 6),
    getOrCreateCalendarToken(db, user.id, project.id),
    headers(),
  ]);
  const origin = `${h.get("x-forwarded-proto") ?? "http"}://${h.get("host")}`;

  const base = `/admin/p/${slug}`;
  const followUp = data.followUp.slice(0, 4);
  const review = data.review.slice(0, 3);
  return (
    <div className="mx-auto max-w-[1120px] space-y-4">
      <div className="flex flex-wrap items-end justify-between gap-x-6 gap-y-3">
        <div><h1 className="page-title">{project.name}</h1><div className="page-meta"><ProjectSummary project={project} /></div></div>
        <DeliverablesMeter data={data} href={`${base}/deliverables`} />
      </div>
      <ErrorBanner message={error} />
      <TodayBoard
        data={data}
        today={today}
        base={base}
        aside={
          <>
            <section>
              <ListHead title="Perlu follow-up" count={data.followUp.length} />
              {can(role, "schedule.status") ? <FollowUpList rows={followUp} slug={slug} /> : <p className="py-2 text-[13px] text-ink-2">Anda tidak punya akses untuk mencatat follow-up.</p>}
              {data.followUp.length > followUp.length && <p className="mt-1 px-1 text-[13px] text-ink-2">+{data.followUp.length - followUp.length} lainnya</p>}
            </section>
            <section>
              <ListHead title="Perlu dicek" count={data.review.length} href={`${base}/assets`} link="Semua aset" />
              {data.review.length === 0 ? <p className="py-2 text-[13px] text-ink-2">Tidak ada link yang menunggu review.</p> : (
                <ul>
                  {review.map((a) => (
                    <li key={a.id} className="due-row">
                      <span className="due-date">v{a.number}</span>
                      <span className="due-name">{a.label} <span className="due-ctx">· {a.where} · {a.status === "pending" ? "menunggu review" : "perlu revisi"}</span></span>
                      <a href={a.url} target="_blank" rel="noreferrer" className="btn-secondary !min-h-7">Buka <Icon name="external" /></a>
                    </li>
                  ))}
                </ul>
              )}
              {data.review.length > review.length && <p className="mt-1 px-1 text-[13px] text-ink-2">+{data.review.length - review.length} lainnya</p>}
            </section>
          </>
        }
      />
      <div className="grid grid-cols-[minmax(0,1fr)] gap-x-8 gap-y-10 pt-8 md:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
        <section className="card min-w-0">
          <div className="list-head"><h2>Perubahan terbaru</h2><Link href={`${base}/activity`} className="text-[13px] font-semibold underline underline-offset-2">Lihat semua</Link></div>
          {recent.length === 0 ? <p className="text-[13px] text-ink-2">Belum ada perubahan.</p> : (
            <ul className="rows">
              {recent.map(({ entry, userName }) => (
                <li key={entry.id} className="min-w-0 break-words py-2 text-[13px]"><span className="font-semibold">{userName ?? "—"}</span> <span className="text-ink-2">·</span> {entry.summary}</li>
              ))}
            </ul>
          )}
        </section>
      <CalendarCard slug={slug} origin={origin} initialToken={calendarToken} />
      {can(role, "project.edit") && (
        <details className="card min-w-0">
          <summary className="cursor-pointer text-sm font-medium">Ubah info project</summary>
          <form action={updateProjectAction} className="mt-4 space-y-3">
            <input type="hidden" name="slug" value={slug} />
            <ProjectFields project={project} />
            <button className="btn">Simpan</button>
          </form>
        </details>
      )}
      {can(role, "project.delete") && (
        <details className="card min-w-0">
          <summary className="cursor-pointer text-sm font-medium text-danger">Hapus project</summary>
          <form action={deleteProjectAction} className="mt-4 space-y-3">
            <input type="hidden" name="slug" value={slug} />
            <p className="muted text-sm">Ini menghapus project beserta timeline, tim, link, deliverables, dan riwayat perubahannya, dan tidak bisa dibatalkan.</p>
            <label className="block text-sm">Ketik &quot;{project.name}&quot; untuk konfirmasi
              <input name="confirmName" required autoComplete="off" className="mt-1 block w-full" />
            </label>
            <button className="btn-danger">Hapus project selamanya</button>
          </form>
        </details>
      )}
      </div>
    </div>
  );
}
