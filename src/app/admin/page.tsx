import Link from "next/link";
import { ProjectFields } from "@/components/project-fields";
import { Brand, UserMenu } from "@/components/shell";
import { ErrorBanner, productionTypeLabel } from "@/components/views";
import { getDb } from "@/db/client";
import { requireUser } from "@/lib/auth/session";
import { fmtDate, today as todayWib } from "@/lib/schedule/dates";
import { getProjectsOverview } from "@/lib/schedule/service";
import { listProjects } from "@/lib/services";
import { createProjectAction } from "./actions";

export default async function AdminHome({ searchParams }: { searchParams: Promise<{ error?: string }> }) {
  const user = await requireUser();
  const { error } = await searchParams;
  const db = await getDb();
  const rows = await listProjects(db, user.id);
  const overview = await getProjectsOverview(db, rows.map((r) => r.project.id), todayWib());
  return (
    <>
      <header className="border-b border-line bg-surface">
        <div className="mx-auto flex max-w-5xl items-center justify-between px-4 py-2.5"><Brand /><UserMenu name={user.name} /></div>
      </header>
      <main className="mx-auto max-w-5xl space-y-6 p-4 md:p-6">
        <h1>Project</h1>
        <ErrorBanner message={error} />
        {rows.length === 0 && <p className="card muted text-sm">Belum ada project. Buat yang pertama di bawah.</p>}
        <ul className="grid gap-3 md:grid-cols-2">
          {rows.map(({ project, role }) => {
            const o = overview.get(project.id)!;
            const pct = o.total ? Math.round((o.done / o.total) * 100) : 0;
            return (
              <li key={project.id}>
                <Link href={`/admin/p/${project.slug}`} className="card block space-y-3 transition hover:border-accent">
                  <div className="flex items-start justify-between gap-2">
                    <div>
                      <div className="text-base font-semibold">{project.name}</div>
                      <div className="muted text-sm">{productionTypeLabel(project.productionType)} · {role}</div>
                    </div>
                    {o.late > 0 && <span className="tag tag-danger">{o.late} terlambat</span>}
                  </div>
                  <div>
                    <div className="h-1.5 overflow-hidden rounded-full bg-raised"><div className="h-full rounded-full bg-ok" style={{ width: `${pct}%` }} /></div>
                    <div className="muted mt-1.5 flex justify-between text-xs">
                      <span>{o.total ? `${o.done}/${o.total} item selesai` : "Belum ada jadwal"}</span>
                      {o.next && <span>Berikutnya: {o.next.name} · {fmtDate(o.next.dueDate)}</span>}
                    </div>
                  </div>
                </Link>
              </li>
            );
          })}
        </ul>
        <details className="card" open={rows.length === 0}>
          <summary className="font-medium text-accent">+ Project baru</summary>
          <form action={createProjectAction} className="mt-4 space-y-3">
            <ProjectFields />
            <button className="btn">Buat project</button>
          </form>
        </details>
      </main>
    </>
  );
}
