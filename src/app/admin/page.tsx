import Link from "next/link";
import { ProjectFields } from "@/components/project-fields";
import { ErrorBanner, productionTypeLabel } from "@/components/views";
import { getDb } from "@/db/client";
import { requireUser } from "@/lib/auth/session";
import { listProjects } from "@/lib/services";
import { createProjectAction, logoutAction } from "./actions";

export default async function AdminHome({ searchParams }: { searchParams: Promise<{ error?: string }> }) {
  const user = await requireUser();
  const { error } = await searchParams;
  const rows = await listProjects(await getDb(), user.id);
  return (
    <main className="mx-auto max-w-4xl space-y-6 p-6">
      <header className="flex items-center justify-between">
        <h1>Project</h1>
        <form action={logoutAction} className="text-sm">
          {user.name} · <button className="cursor-pointer underline">Keluar</button>
        </form>
      </header>
      <ErrorBanner message={error} />
      {rows.length === 0 && <p className="text-sm text-neutral-500">Belum ada project. Buat yang pertama di bawah.</p>}
      <ul className="grid gap-3 md:grid-cols-2">
        {rows.map(({ project, role }) => (
          <li key={project.id}>
            <Link href={`/admin/p/${project.slug}`} className="card block hover:border-neutral-400">
              <div className="font-medium">{project.name}</div>
              <div className="text-sm text-neutral-500">{productionTypeLabel(project.productionType)} · {role}</div>
            </Link>
          </li>
        ))}
      </ul>
      <form action={createProjectAction} className="card space-y-3">
        <h2>Project baru</h2>
        <ProjectFields />
        <button className="btn">Buat project</button>
      </form>
    </main>
  );
}
