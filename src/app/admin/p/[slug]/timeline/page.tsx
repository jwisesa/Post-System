import { TimelineBoard } from "@/components/timeline/TimelineBoard";
import { ErrorBanner } from "@/components/views";
import { listAttachments, listComments } from "@/lib/assets/service";
import { can } from "@/lib/auth/permissions";
import { listPoints } from "@/lib/feedback/service";
import { listSignoffs } from "@/lib/review/service";
import { loadProject } from "@/lib/project-context";
import { today } from "@/lib/schedule/dates";
import { getSchedule, listVersions } from "@/lib/schedule/service";
import { listTemplates } from "@/lib/schedule/template-service";
import { getDriveSummary } from "@/lib/drive-tracker/service";
import { getTeam } from "@/lib/services";

export default async function Timeline({ params, searchParams }: { params: Promise<{ slug: string }>; searchParams: Promise<{ error?: string }> }) {
  const { slug } = await params;
  const { error } = await searchParams;
  const { db, project, role, user } = await loadProject(slug);
  const [schedule, team, attachments, comments, versions, feedback, templates, signoffs] = await Promise.all([
    getSchedule(db, project.id, { includeInternal: true }), getTeam(db, project.id, { includeInternal: true }),
    listAttachments(db, project.id, { includeInternal: true }), listComments(db, project.id), listVersions(db, project.id),
    listPoints(db, project.id, { includeInternal: true }), listTemplates(db, user.id), listSignoffs(db, project.id),
  ]);
  const drives = project.driveTrackerProjectId ? await getDriveSummary(db, project.driveTrackerProjectId) : undefined;
  const contacts = team.flatMap((g) => g.contacts.map((c) => ({ id: c.id, label: `${c.name} (${g.name})` })));
  const mode = can(role, "schedule.edit") ? "edit" : can(role, "schedule.status") ? "status" : "view";
  return (
    <>
      <h1>Timeline</h1>
      <ErrorBanner message={error} />
      <TimelineBoard schedule={schedule} mode={mode} slug={slug} today={today()} contacts={contacts} groups={team.map((g) => ({ id: g.id, name: g.name }))} templates={templates} attachments={attachments} comments={comments} feedback={feedback} signoffs={signoffs} me={{ id: user.id, role }} versions={versions} drives={drives} />
    </>
  );
}
