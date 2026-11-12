import { TimelineBoard } from "@/components/timeline/TimelineBoard";
import { ErrorBanner } from "@/components/views";
import { listAttachments, listComments } from "@/lib/assets/service";
import { can } from "@/lib/auth/permissions";
import { loadProject } from "@/lib/project-context";
import { today } from "@/lib/schedule/dates";
import { getSchedule, listVersions } from "@/lib/schedule/service";
import { getTeam } from "@/lib/services";

export default async function Timeline({ params, searchParams }: { params: Promise<{ slug: string }>; searchParams: Promise<{ error?: string }> }) {
  const { slug } = await params;
  const { error } = await searchParams;
  const { db, project, role, user } = await loadProject(slug);
  const [schedule, team, attachments, comments, versions] = await Promise.all([
    getSchedule(db, project.id, { includeInternal: true }), getTeam(db, project.id, { includeInternal: true }),
    listAttachments(db, project.id, { includeInternal: true }), listComments(db, project.id), listVersions(db, project.id),
  ]);
  const contacts = team.flatMap((g) => g.contacts.map((c) => ({ id: c.id, label: `${c.name} (${g.name})` })));
  const mode = can(role, "schedule.edit") ? "edit" : can(role, "schedule.status") ? "status" : "view";
  return (
    <>
      <h1>Timeline</h1>
      <ErrorBanner message={error} />
      <TimelineBoard schedule={schedule} mode={mode} slug={slug} today={today()} contacts={contacts} attachments={attachments} comments={comments} me={{ id: user.id, role }} versions={versions} />
    </>
  );
}
