import Link from "next/link";
import { Icon } from "@/components/ui/icons";
import { FollowUpList } from "@/components/today/FollowUpList";
import { DeliverablesMeter, ListHead, TodayBoard } from "@/components/today/TodayCards";
import { ErrorBanner, ProjectSummary } from "@/components/views";
import { can } from "@/lib/auth/permissions";
import { loadProject } from "@/lib/project-context";
import { today as todayWib } from "@/lib/schedule/dates";
import { getChecks } from "@/lib/checks/service";
import { DueInvoicesCard } from "@/components/today/DueInvoicesCard";
import { listDueInvoices } from "@/lib/budget/service";
import { DriveCard } from "@/components/today/DriveCard";
import { canUseDriveTracker, getDriveSummary, listDriveTrackerProjects } from "@/lib/drive-tracker/service";
import { getToday } from "@/lib/today/service";
import { listActivity } from "@/lib/services";

export default async function Overview({ params, searchParams }: { params: Promise<{ slug: string }>; searchParams: Promise<{ error?: string }> }) {
  const { slug } = await params;
  const { error } = await searchParams;
  const { db, user, project, role } = await loadProject(slug);
  const today = todayWib();
  const edit = can(role, "project.edit");
  const dt = canUseDriveTracker(user.email);
  const [data, recent, findings, drives, dtOptions, dueInvoices] = await Promise.all([
    getToday(db, project.id, today, { includeInternal: true, feedback: true }),
    listActivity(db, project.id, 6, { hideBudget: true }),
    getChecks(db, project.id, slug, today),
    dt ? getDriveSummary(db, project.driveTrackerProjectId) : Promise.resolve(null),
    edit && dt ? listDriveTrackerProjects(db, user.email) : Promise.resolve([]),
    can(role, "budget.view") ? listDueInvoices(db, user.id, project.id, today) : Promise.resolve([]),
  ]);
  const base = `/admin/p/${slug}`;
  const followUp = data.followUp.slice(0, 4);
  const review = data.review.slice(0, 3);
  return (
    <div className="page space-y-4">
      <div className="page-head">
        <div><h1 className="page-title">{project.name}</h1><div className="page-meta"><ProjectSummary project={project} /></div></div>
        <DeliverablesMeter data={data} href={`${base}/deliverables`} />
      </div>
      <ErrorBanner message={error} />
      <TodayBoard
        below={findings.length > 0 ? (
        <section>
          <ListHead title="Pemeriksaan" count={findings.length} href={`${base}/checks`} link="Semua temuan" />
          <p className="text-[13px] text-ink-2">
            {(["error", "warn", "info"] as const).map((s) => [findings.filter((f) => f.severity === s).length, { error: "error", warn: "peringatan", info: "info" }[s]] as const).filter(([n]) => n).map(([n, l]) => `${n} ${l}`).join(" · ")}
          </p>
          <ul>
            {findings.slice(0, 3).map((f, n) => (
              <li key={n} className="due-row"><span className="due-date tag tag-danger">Error</span><span className="due-name">{f.title} <span className="due-ctx">· {f.detail}</span></span><Link href={f.fix.href} className="btn-secondary !min-h-7">Perbaiki</Link></li>
            ))}
          </ul>
        </section>
        ) : undefined}
        data={data}
        today={today}
        base={base}
        aside={
          <>
            <section>
              <ListHead title="Perlu follow-up" count={data.followUp.length} />
              {can(role, "schedule.status") ? <FollowUpList rows={followUp} slug={slug} /> : <p className="py-2 text-[13px] text-ink-2">Anda tidak punya akses untuk mencatat follow-up.</p>}
              {data.followUp.length > followUp.length && <p className="mt-1 px-1 text-[13px] text-ink-2">+{data.followUp.length - followUp.length} lainnya</p>}
            </section>
            <DueInvoicesCard rows={dueInvoices} slug={slug} />
            {drives && <DriveCard summary={drives} slug={slug} options={dtOptions} linkedId={project.driveTrackerProjectId} canEdit={edit} />}
            <section>
              <ListHead title="Perlu dicek" count={data.review.length} href={`${base}/assets`} link="Semua aset" />
              {data.review.length === 0 ? <p className="py-2 text-[13px] text-ink-2">Tidak ada link yang menunggu review.</p> : (
                <ul>
                  {review.map((a) => (
                    <li key={a.id} className="due-row">
                      <span className="due-date">v{a.number}</span>
                      <span className="due-name">{a.label} <span className="due-ctx">· {a.where} · {a.status === "pending" ? "menunggu review" : "perlu revisi"}</span></span>
                      <a href={a.url} target="_blank" rel="noreferrer" className="btn-secondary !min-h-7">Buka <Icon name="external" /></a>
                    </li>
                  ))}
                </ul>
              )}
              {data.review.length > review.length && <p className="mt-1 px-1 text-[13px] text-ink-2">+{data.review.length - review.length} lainnya</p>}
            </section>
          </>
        }
      />
      <div className="grid grid-cols-[minmax(0,1fr)] gap-x-8 gap-y-10 pt-8 md:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
        <section className="card min-w-0">
          <div className="list-head"><h2>Perubahan terbaru</h2><Link href={`${base}/activity`} className="text-[13px] font-semibold underline underline-offset-2">Lihat semua</Link></div>
          {recent.length === 0 ? <p className="text-[13px] text-ink-2">Belum ada perubahan.</p> : (
            <ul className="rows">
              {recent.map(({ entry, userName }) => (
                <li key={entry.id} className="min-w-0 break-words py-2 text-[13px]"><span className="font-semibold">{userName ?? "—"}</span> <span className="text-ink-2">·</span> {entry.summary}</li>
              ))}
            </ul>
          )}
        </section>
      </div>
    </div>
  );
}
