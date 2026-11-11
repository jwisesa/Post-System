import { AssetsOverview } from "@/components/assets/AssetsOverview";
import { listAttachments } from "@/lib/assets/service";
import { can } from "@/lib/auth/permissions";
import { loadProject } from "@/lib/project-context";
import { getSchedule } from "@/lib/schedule/service";

export default async function Assets({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const { db, project, role } = await loadProject(slug);
  const [schedule, attachments] = await Promise.all([getSchedule(db, project.id, { includeInternal: true }), listAttachments(db, project.id, { includeInternal: true })]);
  return (
    <>
      <div>
        <h1>Aset & dokumen</h1>
        <p className="muted mt-1 text-sm">Semua link preview, aset, dan dokumen project ini beserta riwayat versinya.</p>
      </div>
      <AssetsOverview projectId={project.id} schedule={schedule} attachments={attachments} slug={slug} canEdit={can(role, "asset.edit")} canApprove={can(role, "asset.approve")} />
    </>
  );
}
