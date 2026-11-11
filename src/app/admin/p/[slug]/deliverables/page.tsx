import { DeliverablesBoard } from "@/components/deliverables/DeliverablesBoard";
import { listAttachments } from "@/lib/assets/service";
import { can } from "@/lib/auth/permissions";
import { listDeliverables } from "@/lib/deliverables/service";
import { loadProject } from "@/lib/project-context";
import { today } from "@/lib/schedule/dates";
import { getSchedule } from "@/lib/schedule/service";
import { getTechSpec } from "@/lib/services";

export default async function Deliverables({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const { db, project, role } = await loadProject(slug);
  const [deliverables, attachments, schedule, techSpec] = await Promise.all([
    listDeliverables(db, project.id, { includeInternal: true }), listAttachments(db, project.id, { includeInternal: true }),
    getSchedule(db, project.id, { includeInternal: true }), getTechSpec(db, project.id),
  ]);
  const mode = can(role, "deliverable.edit") ? "edit" : can(role, "deliverable.status") ? "status" : "view";
  return (
    <>
      <div>
        <h1>Deliverables</h1>
        <p className="muted mt-1 text-sm">Semua yang harus dikirim, per platform. Tempel link di tiap item; setiap perubahan link menjadi versi baru.</p>
      </div>
      <DeliverablesBoard deliverables={deliverables} attachments={attachments} tracks={schedule.tracks.map((t) => ({ id: t.id, name: t.name }))} techSpec={techSpec} slug={slug} mode={mode} today={today()} />
    </>
  );
}
