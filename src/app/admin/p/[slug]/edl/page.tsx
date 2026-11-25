import { EdlTool } from "@/components/edl/EdlTool";
import { ShotTracker } from "@/components/edl/ShotTracker";
import { can } from "@/lib/auth/permissions";
import { listShots } from "@/lib/edl/service";
import { loadProject } from "@/lib/project-context";
import { getTechSpec } from "@/lib/services";

export default async function EdlPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const { db, project, role } = await loadProject(slug);
  const [spec, shots] = await Promise.all([getTechSpec(db, project.id), listShots(db, project.id)]);
  return (
    <div className="page space-y-8" data-w="full">
      <div className="page-head"><div>
        <h1 className="page-title">Tool EDL</h1>
        <p className="page-meta">Import EDL, FCP7 XML, atau FCPXML, pilih shot, beri nama, lalu export pull list (dengan handles), VFX breakdown, dan EDL baru, atau simpan ke shot tracker.</p>
      </div></div>
      <EdlTool slug={slug} techFps={typeof spec.frameRate === "string" ? spec.frameRate : ""} canSave={can(role, "shot.edit")} />
      <ShotTracker slug={slug} shots={shots} canEdit={can(role, "shot.edit")} canTrack={can(role, "shot.status")} />
    </div>
  );
}
