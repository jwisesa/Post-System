import Link from "next/link";
import { ProjectFields } from "@/components/project-fields";
import { ErrorBanner, ProjectSummary } from "@/components/views";
import { can } from "@/lib/auth/permissions";
import { loadProject } from "@/lib/project-context";
import { addDays, diffDays, fmtDate, today as todayWib } from "@/lib/schedule/dates";
import { getSchedule } from "@/lib/schedule/service";
import { statusLabel } from "@/lib/schedule/templates";
import { listActivity } from "@/lib/services";
import { updateProjectAction } from "../../actions";

export default async function Overview({ params, searchParams }: { params: Promise<{ slug: string }>; searchParams: Promise<{ error?: string }> }) {
  const { slug } = await params;
  const { error } = await searchParams;
  const { db, project, role } = await loadProject(slug);
  const [schedule, recent] = await Promise.all([getSchedule(db, project.id, { includeInternal: true }), listActivity(db, project.id, 6)]);
  const today = todayWib();
  const open = schedule.tracks.flatMap((t) => t.items.map((i) => ({ ...i, track: t.name }))).filter((i) => i.status !== "done");
  const late = open.filter((i) => i.dueDate < today).sort((a, b) => a.dueDate.localeCompare(b.dueDate));
  const soon = open.filter((i) => i.dueDate >= today && i.dueDate <= addDays(today, 7)).sort((a, b) => a.dueDate.localeCompare(b.dueDate));
  const when = (d: string) => { const n = diffDays(today, d); return n === 0 ? "hari ini" : n === 1 ? "besok" : n > 0 ? `${n} hari lagi` : `${-n} hari lalu`; };
  const list = (items: typeof open, empty: string) =>
    items.length === 0 ? <p className="muted text-sm">{empty}</p> : (
      <ul className="divide-y divide-line">
        {items.map((i) => (
          <li key={i.id} className="flex items-center justify-between gap-3 py-2 text-sm">
            <span className="min-w-0"><span className="font-medium">{i.name}</span> <span className="muted">· {i.track} · {statusLabel(i.status)}{i.picName && ` · ${i.picName}`}</span></span>
            <span className="muted shrink-0 text-right">{fmtDate(i.dueDate)} <span className={i.dueDate < today ? "text-danger" : ""}>({when(i.dueDate)})</span></span>
          </li>
        ))}
      </ul>
    );

  return (
    <>
      <div className="space-y-2"><h1>{project.name}</h1><ProjectSummary project={project} /></div>
      <ErrorBanner message={error} />
      <div className="grid gap-4 lg:grid-cols-2">
        <section className="card">
          <h2 className="mb-2">Terlambat {late.length > 0 && <span className="tag tag-danger ml-1">{late.length}</span>}</h2>
          {list(late, "Tidak ada yang terlambat.")}
        </section>
        <section className="card">
          <h2 className="mb-2">Due 7 hari ke depan</h2>
          {list(soon, "Tidak ada deadline dalam 7 hari.")}
        </section>
      </div>
      <section className="card">
        <div className="mb-2 flex items-center justify-between"><h2>Perubahan terbaru</h2><Link href={`/admin/p/${slug}/activity`} className="text-sm text-accent">Lihat semua</Link></div>
        <ul className="divide-y divide-line">
          {recent.map(({ entry, userName }) => (
            <li key={entry.id} className="py-2 text-sm"><span className="font-medium">{userName ?? "—"}</span> <span className="muted">·</span> {entry.summary}</li>
          ))}
        </ul>
      </section>
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
