import Link from "next/link";
import { Brand, UserMenu } from "@/components/shell";
import { NavLink } from "@/components/ui/controls";
import { can } from "@/lib/auth/permissions";
import { loadProject } from "@/lib/project-context";
import { listProjects } from "@/lib/services";

export default async function ProjectLayout({ children, params }: { children: React.ReactNode; params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const { db, project, role, user } = await loadProject(slug);
  const others = (await listProjects(db, user.id)).filter((r) => r.project.id !== project.id);
  const base = `/admin/p/${slug}`;
  const nav = (
    <>
      <NavLink href={base} exact>Ringkasan</NavLink>
      <NavLink href={`${base}/timeline`}>Timeline</NavLink>
      <NavLink href={`${base}/assets`}>Aset & dokumen</NavLink>
      <NavLink href={`${base}/technical`}>Technical Page</NavLink>
      <NavLink href={`${base}/team`}>Tim</NavLink>
      {can(role, "access.manage") && <NavLink href={`${base}/access`}>Akses</NavLink>}
      <NavLink href={`${base}/activity`}>Change log</NavLink>
    </>
  );
  return (
    <div className="flex min-h-dvh flex-col md:flex-row">
      <aside className="shrink-0 border-b border-line bg-surface md:sticky md:top-0 md:h-dvh md:w-56 md:border-r md:border-b-0">
        <div className="flex items-center justify-between px-4 py-3 md:block">
          <Brand />
          <div className="md:hidden"><UserMenu name={user.name} /></div>
        </div>
        <details className="group mx-2 mb-2 rounded-lg border border-line">
          <summary className="flex list-none items-center justify-between gap-2 px-2.5 py-2 text-sm font-medium">
            <span className="truncate">{project.name}</span><span aria-hidden className="muted transition group-open:rotate-180">▾</span>
          </summary>
          <div className="border-t border-line p-1 text-sm">
            {others.map((o) => (
              <Link key={o.project.id} href={`/admin/p/${o.project.slug}`} className="block truncate rounded-md px-2 py-1.5 hover:bg-raised">{o.project.name}</Link>
            ))}
            <Link href="/admin" className="muted block rounded-md px-2 py-1.5 hover:bg-raised">Semua project →</Link>
          </div>
        </details>
        <nav aria-label="Navigasi project" className="flex gap-1 overflow-x-auto px-2 pb-2 md:flex-col md:overflow-visible">{nav}</nav>
      </aside>
      <div className="min-w-0 flex-1">
        <header className="hidden items-center justify-between border-b border-line bg-surface px-6 py-2 md:flex">
          <span className="muted text-sm">{project.name}</span>
          <UserMenu name={user.name} role={role} />
        </header>
        <main className="space-y-5 p-4 md:p-6">{children}</main>
      </div>
    </div>
  );
}
