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
    <div className="page space-y-10">
      <div className="page-head">
        <h1 className="page-title">Tim</h1>
        {canEdit && (
          <div className="page-actions">
            <details className="relative">
              <summary className="btn-secondary cursor-pointer list-none"><Icon name="plus" />Departemen / vendor baru</summary>
              <form action={addGroupAction} className="popover absolute end-0 z-30 mt-1 flex w-80 max-w-[85vw] items-end gap-3 p-3">
                <input type="hidden" name="slug" value={slug} />
                <label className="flex-1"><span>Nama departemen</span><input name="name" required /></label>
                <button className="btn">Tambah</button>
              </form>
            </details>
          </div>
        )}
      </div>
      <ErrorBanner message={error} />
      <TeamDirectory team={team} slug={canEdit ? slug : undefined} />
    </div>
  );
}
