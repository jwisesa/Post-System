import { FindingsList } from "@/components/findings-list";
import { getChecks } from "@/lib/checks/service";
import { loadProject } from "@/lib/project-context";
import { today } from "@/lib/schedule/dates";

export default async function Checks({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const { db, project, user } = await loadProject(slug);
  const findings = await getChecks(db, project.id, slug, today());
  return (
    <div className="page space-y-6" data-w="narrow">
      <div className="page-head">
        <div>
          <h1 className="page-title">Pemeriksaan <span className="muted">{findings.length}</span></h1>
          <p className="page-meta">Perbandingan Technical Page, deliverables, dan jadwal. Hanya peringatan; tidak menghalangi apa pun.</p>
        </div>
      </div>
      <FindingsList findings={findings} userId={user.id} slug={slug} />
    </div>
  );
}
