import Link from "next/link";
import { Brand, UserMenu } from "@/components/shell";
import { Topbar } from "@/components/ui/crumbs";
import { NavScroll } from "@/components/ui/nav-scroll";
import { ProjectSettings } from "@/components/project-settings";
import { ProjectFields } from "@/components/project-fields";
import { CalendarCard } from "@/components/today/CalendarCard";
import { getOrCreateCalendarToken } from "@/lib/calendar/service";
import { deleteProjectAction, updateProjectAction } from "../../actions";
import { headers } from "next/headers";
import { Icon } from "@/components/ui/icons";
import { NavLink, SidebarToggle } from "@/components/ui/controls";
import { can } from "@/lib/auth/permissions";
import { loadProject } from "@/lib/project-context";
import { listProjects } from "@/lib/services";
import { cookies } from "next/headers";
import { themeViewport } from "@/lib/theme-color";

export const generateViewport = () => themeViewport("board");

export default async function ProjectLayout({ children, params }: { children: React.ReactNode; params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const { db, project, role, user } = await loadProject(slug);
  const others = (await listProjects(db, user.id)).filter((r) => r.project.id !== project.id);
  const collapsed = (await cookies()).get("sidebar")?.value === "collapsed";
  const base = `/admin/p/${slug}`;
  const h = await headers();
  const origin = `${h.get("x-forwarded-proto") ?? "http"}://${h.get("host")}`;
  const calendarToken = await getOrCreateCalendarToken(db, user.id, project.id);
  const nav = (
    <>
      <NavLink href={base} exact icon="today">Hari Ini</NavLink>
      <NavLink href={`${base}/timeline`} icon="timeline">Timeline</NavLink>
      <NavLink href={`${base}/deliverables`} icon="deliverables">Deliverables</NavLink>
      {can(role, "budget.view") && <NavLink href={`${base}/budget`} icon="budget">Anggaran & vendor</NavLink>}
      <NavLink href={`${base}/assets`} icon="assets">Aset & dokumen</NavLink>
      <NavLink href={`${base}/technical`} icon="technical">Technical Page</NavLink>
      <NavLink href={`${base}/checks`} icon="check">Pemeriksaan</NavLink>
      <NavLink href={`${base}/edl`} icon="edl">Tool EDL</NavLink>
      <NavLink href={`${base}/script`} icon="script">Naskah</NavLink>
      <NavLink href={`${base}/team`} icon="team">Tim</NavLink>
      {can(role, "access.manage") && <NavLink href={`${base}/access`} icon="access">Akses</NavLink>}
      <NavLink href={`${base}/report`} icon="report">Laporan</NavLink>
      <NavLink href={`${base}/activity`} icon="activity">Change log</NavLink>
    </>
  );
  return (
    <div className="shell flex min-h-dvh flex-col md:flex-row" data-collapsed={collapsed ? "" : undefined}>
      <aside id="project-sidebar" className="sidebar shrink-0 pt-[env(safe-area-inset-top)] print:hidden md:sticky md:top-0 md:h-dvh md:pt-0">
        <div className="m-row">
          <div className="m-brand px-4 py-3"><Brand /></div>
          <details className="group relative mx-2 md:mb-3">
            <summary className="project-switch cursor-pointer list-none" title={project.name}>
              <span className="project-initial" aria-hidden>{project.name.trim().charAt(0).toUpperCase()}</span><span className="project-name truncate">{project.name}</span><Icon name="chevron" className="muted rotate-90 group-open:-rotate-90" />
            </summary>
            <div className="popover absolute inset-x-0 z-30 mt-1 p-1 text-sm">
              {others.map((o) => (
                <Link key={o.project.id} href={`/admin/p/${o.project.slug}`} className="nav-link truncate">{o.project.name}</Link>
              ))}
              <Link href="/admin" className="nav-link flex items-center justify-between">Semua project <Icon name="chevron" className="muted" /></Link>
              <hr className="my-1 border-line" />
              <ProjectSettings>
                <div className="space-y-6">
                  {can(role, "project.edit") && (
                    <section className="space-y-3">
                      <h3 className="text-sm font-semibold">Info project</h3>
                      <form action={updateProjectAction} className="space-y-3">
                        <input type="hidden" name="slug" value={slug} />
                        <ProjectFields project={project} />
                        <button className="btn">Simpan</button>
                      </form>
                    </section>
                  )}
                  <CalendarCard slug={slug} origin={origin} initialToken={calendarToken} />
                  {can(role, "project.delete") && (
                    <section className="space-y-3">
                      <h3 className="text-sm font-semibold text-danger">Hapus project</h3>
                      <form action={deleteProjectAction} className="space-y-3">
                        <input type="hidden" name="slug" value={slug} />
                        <p className="muted text-sm">Ini menghapus project beserta timeline, tim, link, deliverables, dan riwayat perubahannya, dan tidak bisa dibatalkan.</p>
                        <label className="block text-sm">Ketik &quot;{project.name}&quot; untuk konfirmasi
                          <input name="confirmName" required autoComplete="off" className="mt-1 block w-full" />
                        </label>
                        <button className="btn-danger">Hapus project selamanya</button>
                      </form>
                    </section>
                  )}
                </div>
              </ProjectSettings>
            </div>
          </details>
          <div className="md:hidden"><UserMenu name={user.name} /></div>
        </div>
        <NavScroll>{nav}</NavScroll>
        <div className="hidden px-2 pb-3 md:block"><SidebarToggle initial={collapsed} /></div>
      </aside>
      <div className="min-w-0 flex-1">
        <Topbar slug={slug} projectName={project.name}><UserMenu name={user.name} role={role} /></Topbar>
        <main className="space-y-5 px-4 py-5 pb-[calc(1.25rem+env(safe-area-inset-bottom))] md:px-8 md:pt-2 md:pb-6">{children}</main>
      </div>
    </div>
  );
}
