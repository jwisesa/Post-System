import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { TeamDirectory } from "@/components/team-directory";
import { TimelineBoard } from "@/components/timeline/TimelineBoard";
import { Tabs, ThemeToggle } from "@/components/ui/controls";
import { ProjectSummary, TechSpecView } from "@/components/views";
import { getDb } from "@/db/client";
import { today } from "@/lib/schedule/dates";
import { getViewerData } from "@/lib/services";

export const metadata: Metadata = { robots: { index: false, follow: false }, referrer: "no-referrer" };

export default async function ViewOnly({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const data = await getViewerData(await getDb(), token);
  if (!data) notFound();
  const contacts = data.team.flatMap((g) => g.contacts.map((c) => ({ id: c.id, label: `${c.name} (${g.name})` })));
  return (
    <main className="mx-auto max-w-7xl space-y-5 p-4 md:p-6">
      <header className="flex items-start justify-between gap-3">
        <div className="space-y-2">
          <span className="tag tag-accent">View only</span>
          <h1>{data.project.name}</h1>
          <ProjectSummary project={data.project} />
        </div>
        <ThemeToggle />
      </header>
      <Tabs
        tabs={[
          { id: "timeline", label: "Timeline", content: <TimelineBoard schedule={data.schedule} mode="view" slug="" today={today()} contacts={contacts} /> },
          { id: "technical", label: "Technical Page", content: <TechSpecView spec={data.techSpec} /> },
          { id: "team", label: "Tim", content: <TeamDirectory team={data.team} /> },
        ]}
      />
    </main>
  );
}
