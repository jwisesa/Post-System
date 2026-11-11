import Link from "next/link";
import { can } from "@/lib/auth/permissions";
import { loadProject } from "@/lib/project-context";

export default async function ProjectLayout({ children, params }: { children: React.ReactNode; params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const { project, role, user } = await loadProject(slug);
  const base = `/admin/p/${slug}`;
  const tabs = [
    { href: base, label: "Ringkasan" },
    { href: `${base}/technical`, label: "Technical Page" },
    { href: `${base}/team`, label: "Tim" },
    ...(can(role, "access.manage") ? [{ href: `${base}/access`, label: "Akses" }] : []),
    { href: `${base}/activity`, label: "Change log" },
  ];
  return (
    <div className="mx-auto max-w-5xl space-y-6 p-6">
      <header className="space-y-3">
        <div className="flex items-center justify-between text-sm text-neutral-500">
          <Link href="/admin" className="underline">← Semua project</Link>
          <span>{user.name} · {role}</span>
        </div>
        <h1>{project.name}</h1>
        <nav className="flex gap-4 border-b border-neutral-200 text-sm">
          {tabs.map((t) => (
            <Link key={t.href} href={t.href} className="-mb-px border-b-2 border-transparent pb-2 hover:border-neutral-900">{t.label}</Link>
          ))}
        </nav>
      </header>
      <main className="space-y-6">{children}</main>
    </div>
  );
}
