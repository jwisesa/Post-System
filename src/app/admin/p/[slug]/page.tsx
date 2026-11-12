import { headers } from "next/headers";
import Link from "next/link";
import { ProjectFields } from "@/components/project-fields";
import { CalendarCard } from "@/components/today/CalendarCard";
import { FollowUpList } from "@/components/today/FollowUpList";
import { TodayCards } from "@/components/today/TodayCards";
import { ErrorBanner, ProjectSummary } from "@/components/views";
import { can } from "@/lib/auth/permissions";
import { getOrCreateCalendarToken } from "@/lib/calendar/service";
import { loadProject } from "@/lib/project-context";
import { today as todayWib } from "@/lib/schedule/dates";
import { getToday } from "@/lib/today/service";
import { listActivity } from "@/lib/services";
import { updateProjectAction } from "../../actions";

export default async function Overview({ params, searchParams }: { params: Promise<{ slug: string }>; searchParams: Promise<{ error?: string }> }) {
  const { slug } = await params;
  const { error } = await searchParams;
  const { db, user, project, role } = await loadProject(slug);
  const today = todayWib();
  const [data, recent, calendarToken, h] = await Promise.all([
    getToday(db, project.id, today, { includeInternal: true }),
    listActivity(db, project.id, 6),
    getOrCreateCalendarToken(db, user.id, project.id),
    headers(),
  ]);
  const origin = `${h.get("x-forwarded-proto") ?? "http"}://${h.get("host")}`;

  return (
    <>
      <div className="space-y-2"><h1>{project.name}</h1><ProjectSummary project={project} /></div>
      <ErrorBanner message={error} />
      <TodayCards data={data} today={today} deliverablesHref={`/admin/p/${slug}/deliverables`} />
      <section className="card">
        <h2 className="mb-2">Perlu follow-up {data.followUp.length > 0 && <span className="tag tag-warn ml-1">{data.followUp.length}</span>}</h2>
        <p className="muted mb-1 text-xs">Item yang terlambat atau due dalam 7 hari, tanpa update lebih dari 3 hari.</p>
        {can(role, "schedule.status") ? <FollowUpList rows={data.followUp} slug={slug} /> : <p className="muted text-sm">Anda tidak punya akses untuk mencatat follow-up.</p>}
      </section>
      <section className="card">
        <div className="mb-2 flex items-center justify-between">
          <h2>Perlu dicek {data.review.length > 0 && <span className="tag tag-warn ml-1">{data.review.length}</span>}</h2>
          <Link href={`/admin/p/${slug}/assets`} className="text-sm text-accent">Semua aset</Link>
        </div>
        {data.review.length === 0 ? <p className="muted text-sm">Tidak ada link yang menunggu review.</p> : (
          <ul className="divide-y divide-line">
            {data.review.map((a) => (
              <li key={a.id} className="flex items-center justify-between gap-3 py-2 text-sm">
                <span className="min-w-0">
                  <span className="font-medium">{a.label}</span> <span className="tag tag-accent">v{a.number}</span>{" "}
                  <span className="muted">· {a.where} · {a.status === "pending" ? "menunggu review" : "perlu revisi"}</span>
                </span>
                <a href={a.url} target="_blank" rel="noreferrer" className="btn-secondary !min-h-7 shrink-0 !py-0.5">Buka ↗</a>
              </li>
            ))}
          </ul>
        )}
      </section>
      <section className="card">
        <div className="mb-2 flex items-center justify-between"><h2>Perubahan terbaru</h2><Link href={`/admin/p/${slug}/activity`} className="text-sm text-accent">Lihat semua</Link></div>
        {recent.length === 0 ? <p className="muted text-sm">Belum ada perubahan.</p> : (
          <ul className="divide-y divide-line">
            {recent.map(({ entry, userName }) => (
              <li key={entry.id} className="py-2 text-sm"><span className="font-medium">{userName ?? "—"}</span> <span className="muted">·</span> {entry.summary}</li>
            ))}
          </ul>
        )}
      </section>
      <CalendarCard slug={slug} origin={origin} initialToken={calendarToken} />
      {can(role, "project.edit") && (
        <details className="card">
          <summary className="font-medium text-accent">Ubah info project</summary>
          <form action={updateProjectAction} className="mt-4 space-y-3">
            <input type="hidden" name="slug" value={slug} />
            <ProjectFields project={project} />
            <button className="btn">Simpan</button>
          </form>
        </details>
      )}
    </>
  );
}
