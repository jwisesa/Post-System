import Link from "next/link";
import { Icon } from "@/components/ui/icons";
import { ProjectFields } from "@/components/project-fields";
import { Brand, UserMenu } from "@/components/shell";
import { ErrorBanner, productionTypeLabel } from "@/components/views";
import { getDb } from "@/db/client";
import { requireUser } from "@/lib/auth/session";
import { fmtDate, today as todayWib } from "@/lib/schedule/dates";
import { getProjectsOverview } from "@/lib/schedule/service";
import { listProjects } from "@/lib/services";
import { themeViewport } from "@/lib/theme-color";
import { createProjectAction } from "./actions";

export const generateViewport = () => themeViewport("board");

export default async function AdminHome({ searchParams }: { searchParams: Promise<{ error?: string }> }) {
  const user = await requireUser();
  const { error } = await searchParams;
  const db = await getDb();
  const rows = await listProjects(db, user.id);
  const overview = await getProjectsOverview(db, rows.map((r) => r.project.id), todayWib());
  return (
    <>
      <header className="board pt-[env(safe-area-inset-top)]">
        <div className="mx-auto flex h-14 max-w-[880px] items-center justify-between px-4 md:px-8"><Brand /><UserMenu name={user.name} /></div>
      </header>
      <main className="mx-auto max-w-[880px] space-y-6 px-4 py-6 md:px-8 md:py-8">
        <h1 className="page-title">Project</h1>
        <ErrorBanner message={error} />
        {rows.length === 0 && <div className="empty"><p>Belum ada project.</p><p className="muted">Buat yang pertama di bawah.</p></div>}
        <ul className="rows">
          {rows.map(({ project, role }) => {
            const o = overview.get(project.id)!;
            const pct = o.total ? Math.round((o.done / o.total) * 100) : 0;
            return (
              <li key={project.id}>
                <Link href={`/admin/p/${project.slug}`} className="row-btn !flex-col !items-stretch !py-4 md:!flex-row md:!items-start">
                  <div className="min-w-0 flex-1">
                      <div className="font-display text-xl font-semibold">{project.name}</div>
                      <div className="muted text-sm">{productionTypeLabel(project.productionType)} · {role}</div>
                  </div>
                  <div className="w-full shrink-0 space-y-1.5 md:w-60 md:text-end">
                    <div className="meter"><span style={{ width: `${pct}%` }} /></div>
                    <div className="muted text-[13px]">{o.total ? `${o.done}/${o.total} item selesai` : "Belum ada jadwal"}</div>
                    {o.next && <div className="truncate text-[13px]">Berikutnya: {o.next.name} · {fmtDate(o.next.dueDate)}</div>}
                    {o.late > 0 && <div><span className="tag tag-danger">{o.late} terlambat</span></div>}
                  </div>
                </Link>
              </li>
            );
          })}
        </ul>
        <details className="card" open={rows.length === 0}>
          <summary className="btn-secondary inline-flex cursor-pointer list-none"><Icon name="plus" />Project baru</summary>
          <form action={createProjectAction} className="mt-4 space-y-3">
            <ProjectFields />
            <button className="btn">Buat project</button>
          </form>
        </details>
      </main>
    </>
  );
}
