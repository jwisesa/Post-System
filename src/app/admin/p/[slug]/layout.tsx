import Link from "next/link";
import { Brand, UserMenu } from "@/components/shell";
import { Icon } from "@/components/ui/icons";
import { NavLink } from "@/components/ui/controls";
import { can } from "@/lib/auth/permissions";
import { loadProject } from "@/lib/project-context";
import { listProjects } from "@/lib/services";
import { themeViewport } from "@/lib/theme-color";

export const generateViewport = () => themeViewport("board");

export default async function ProjectLayout({ children, params }: { children: React.ReactNode; params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const { db, project, role, user } = await loadProject(slug);
  const others = (await listProjects(db, user.id)).filter((r) => r.project.id !== project.id);
  const base = `/admin/p/${slug}`;
  const nav = (
    <>
      <NavLink href={base} exact>Hari Ini</NavLink>
      <NavLink href={`${base}/timeline`}>Timeline</NavLink>
      <NavLink href={`${base}/deliverables`}>Deliverables</NavLink>
      <NavLink href={`${base}/assets`}>Aset & dokumen</NavLink>
      <NavLink href={`${base}/technical`}>Technical Page</NavLink>
      <NavLink href={`${base}/team`}>Tim</NavLink>
      {can(role, "access.manage") && <NavLink href={`${base}/access`}>Akses</NavLink>}
      <NavLink href={`${base}/report`}>Laporan</NavLink>
      <NavLink href={`${base}/activity`}>Change log</NavLink>
    </>
  );
  return (
    <div className="flex min-h-dvh flex-col md:flex-row">
      <aside className="sidebar shrink-0 pt-[env(safe-area-inset-top)] print:hidden md:sticky md:top-0 md:h-dvh md:w-56 md:pt-0">
        <div className="flex items-center justify-between px-4 py-3 md:block">
          <Brand />
          <div className="md:hidden"><UserMenu name={user.name} /></div>
        </div>
        <details className="group relative mx-2 mb-3">
          <summary className="project-switch cursor-pointer list-none">
            <span className="truncate">{project.name}</span><Icon name="chevron" className="muted rotate-90 group-open:-rotate-90" />
          </summary>
          <div className="popover absolute inset-x-0 z-30 mt-1 p-1 text-sm">
            {others.map((o) => (
              <Link key={o.project.id} href={`/admin/p/${o.project.slug}`} className="nav-link truncate">{o.project.name}</Link>
            ))}
            <Link href="/admin" className="nav-link flex items-center justify-between">Semua project <Icon name="chevron" className="muted" /></Link>
          </div>
        </details>
        <nav aria-label="Navigasi project" className="nav-scroll flex gap-0.5 overflow-x-auto px-2 pb-3 md:flex-col md:overflow-visible">{nav}</nav>
      </aside>
      <div className="min-w-0 flex-1">
        <header className="hidden print:hidden! items-center justify-end bg-bg h-14 px-8 md:flex">
          <UserMenu name={user.name} role={role} />
        </header>
        <main className="space-y-5 px-4 py-5 pb-[calc(1.25rem+env(safe-area-inset-bottom))] md:px-8 md:py-6">{children}</main>
      </div>
    </div>
  );
}
