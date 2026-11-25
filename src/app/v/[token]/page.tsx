import type { Metadata } from "next";
import { headers } from "next/headers";
import { notFound } from "next/navigation";
import { AssetsOverview } from "@/components/assets/AssetsOverview";
import { DeliverablesBoard } from "@/components/deliverables/DeliverablesBoard";
import { TeamDirectory } from "@/components/team-directory";
import { TimelineBoard } from "@/components/timeline/TimelineBoard";
import { TodayCards } from "@/components/today/TodayCards";
import { CopyButton, Tabs, ThemeToggle } from "@/components/ui/controls";
import { ProjectSummary, TechSpecView } from "@/components/views";
import { getDb } from "@/db/client";
import { today } from "@/lib/schedule/dates";
import { getViewerData } from "@/lib/services";

export const metadata: Metadata = { robots: { index: false, follow: false }, referrer: "no-referrer" };

export default async function ViewOnly({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const data = await getViewerData(await getDb(), token);
  if (!data) notFound();
  const h = await headers();
  const feedUrl = `${h.get("x-forwarded-proto") ?? "http"}://${h.get("host")}/v/${token}/calendar`;
  const contacts = data.team.flatMap((g) => g.contacts.map((c) => ({ id: c.id, label: `${c.name} (${g.name})` })));
  const has = new Set(data.sections);
  const tabs = [
    has.has("today") && {
      id: "today",
      label: "Hari Ini",
      content: (
        <>
          <TodayCards data={data.today} today={today()} />
          <section className="card space-y-2">
            <h2>Langganan kalender</h2>
            <p className="muted text-xs">Tambahkan jadwal ini ke aplikasi kalender (Kalender → Tambah Kalender Langganan, atau Google Calendar → Dari URL). Google memperbarui hanya setiap beberapa jam.</p>
            <div className="flex flex-wrap items-center gap-2">
              <code className="min-w-0 flex-1 truncate rounded-md bg-raised px-2 py-1.5 font-mono text-xs">{feedUrl}</code>
              <CopyButton text={feedUrl} label="Salin link" />
            </div>
          </section>
        </>
      ),
    },
    has.has("timeline") && { id: "timeline", label: "Timeline", content: <TimelineBoard schedule={data.schedule} mode="view" slug="" today={today()} contacts={contacts} attachments={data.attachments} /> },
    has.has("deliverables") && { id: "deliverables", label: "Deliverables", content: <DeliverablesBoard deliverables={data.deliverables} attachments={data.attachments} tracks={data.schedule.tracks.map((t) => ({ id: t.id, name: t.name }))} techSpec={data.techSpec} slug="" mode="view" today={today()} /> },
    has.has("assets") && { id: "assets", label: "Aset & dokumen", content: <AssetsOverview projectId={data.project.id} schedule={data.schedule} attachments={data.attachments} slug="" canEdit={false} canApprove={false} /> },
    has.has("technical") && { id: "technical", label: "Technical Page", content: <TechSpecView spec={data.techSpec} /> },
    has.has("team") && { id: "team", label: "Tim", content: <TeamDirectory team={data.team} /> },
    has.has("checks") && {
      id: "checks",
      label: "Pemeriksaan",
      content: (
        <section className="card space-y-2">
          <h2>Pemeriksaan</h2>
          {data.checks.length === 0 ? <p className="muted text-sm">Tidak ada temuan.</p> : (
            <ul className="rows">{data.checks.map((f, n) => <li key={n} className="py-2 text-sm"><span className="tag">{f.severity}</span> <span className="font-medium">{f.title}</span><br /><span className="muted text-xs">{f.detail}</span></li>)}</ul>
          )}
        </section>
      ),
    },
    has.has("feedback") && {
      id: "feedback",
      label: "Feedback",
      content: (
        <section className="card space-y-2">
          <h2>Feedback</h2>
          {data.feedback.length === 0 ? <p className="muted text-sm">Belum ada feedback.</p> : (
            <ul className="rows">{data.feedback.map((p, n) => <li key={n} className="py-2 text-sm"><span className="muted text-xs">{p.itemName}{p.ref && ` · ${p.ref}`} · {p.status}</span><br />{p.body}</li>)}</ul>
          )}
        </section>
      ),
    },
  ].filter((t) => !!t);
  if (!tabs.length) notFound();
  return (
    <main className="mx-auto max-w-7xl space-y-5 p-4 md:p-6">
      <header className="flex items-start justify-between gap-3">
        <div className="space-y-2">
          <span className="tag">View only</span>
          <h1 className="page-title">{data.project.name}</h1>
          <ProjectSummary project={data.project} />
        </div>
        <ThemeToggle />
      </header>
      <Tabs tabs={tabs} />
    </main>
  );
}
