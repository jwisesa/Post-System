import { TeamDirectory } from "@/components/team-directory";
import { Icon } from "@/components/ui/icons";
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
    <div className="mx-auto max-w-[1040px] space-y-10">
      <h1 className="page-title">Tim</h1>
      <ErrorBanner message={error} />
      <TeamDirectory team={team} slug={canEdit ? slug : undefined} />
      {canEdit && (
        <details className="card">
          <summary className="btn-ghost inline-flex cursor-pointer list-none"><Icon name="plus" />Departemen / vendor baru</summary>
          <form action={addGroupAction} className="mt-3 flex items-end gap-3">
            <input type="hidden" name="slug" value={slug} />
            <label className="flex-1"><span>Nama departemen</span><input name="name" required /></label>
            <button className="btn">Tambah</button>
          </form>
        </details>
      )}
    </div>
  );
}
