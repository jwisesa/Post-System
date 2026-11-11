import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { ProjectSummary, TeamView, TechSpecView } from "@/components/views";
import { ScheduleView } from "@/components/schedule-view";
import { getDb } from "@/db/client";
import { getViewerData } from "@/lib/services";

export const metadata: Metadata = { robots: { index: false, follow: false }, referrer: "no-referrer" };

export default async function ViewOnly({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const data = await getViewerData(await getDb(), token);
  if (!data) notFound();
  return (
    <main className="mx-auto max-w-5xl space-y-6 p-6">
      <header>
        <p className="text-xs uppercase tracking-wide text-neutral-500">View only</p>
        <h1>{data.project.name}</h1>
      </header>
      <section className="card"><ProjectSummary project={data.project} /></section>
      <h2>Timeline</h2>
      <ScheduleView schedule={data.schedule} />
      <h2>Technical Page</h2>
      <TechSpecView spec={data.techSpec} />
      <h2>Tim</h2>
      <TeamView team={data.team} />
    </main>
  );
}
