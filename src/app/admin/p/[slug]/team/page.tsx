import { TeamDirectory } from "@/components/team-directory";
import { ErrorBanner } from "@/components/views";
import { can } from "@/lib/auth/permissions";
import { loadProject } from "@/lib/project-context";
import { getTeam } from "@/lib/services";
import { addGroupAction } from "../../../actions";

export default async function Team({ params, searchParams }: { params: Promise<{ slug: string }>; searchParams: Promise<{ error?: string }> }) {
  const { slug } = await params;
  const { error } = await searchParams;
  const { db, project, role } = await loadProject(slug);
  const team = await getTeam(db, project.id, { includeInternal: true });
  const canEdit = can(role, "team.edit");
  return (
    <>
      <h1>Tim</h1>
      <ErrorBanner message={error} />
      <TeamDirectory team={team} slug={canEdit ? slug : undefined} />
      {canEdit && (
        <details className="card">
          <summary className="font-medium text-accent">+ Departemen / vendor baru</summary>
          <form action={addGroupAction} className="mt-3 flex items-end gap-3">
            <input type="hidden" name="slug" value={slug} />
            <label className="flex-1"><span>Nama departemen</span><input name="name" required /></label>
            <button className="btn">Tambah</button>
          </form>
        </details>
      )}
    </>
  );
}
