import { ReportActions } from "@/components/today/ReportActions";
import { summaryText } from "@/components/today/summary";
import { when } from "@/components/today/TodayCards";
import { ProjectSummary } from "@/components/views";
import { loadProject } from "@/lib/project-context";
import { fmtDate, today as todayWib } from "@/lib/schedule/dates";
import { getWeeklyReport } from "@/lib/today/service";

const stamp = new Intl.DateTimeFormat("id-ID", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit", timeZone: "Asia/Jakarta" });

export default async function Report({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const { db, project } = await loadProject(slug);
  const today = todayWib();
  const report = await getWeeklyReport(db, project.id, today);
  const t = report.today;
  const entries = (list: typeof t.late, empty: string) =>
    list.length === 0 ? <p className="muted text-sm">{empty}</p> : (
      <ul className="divide-y divide-line">
        {list.map((e) => (
          <li key={`${e.kind}-${e.id}`} className="flex justify-between gap-3 py-1.5 text-sm">
            <span className="min-w-0"><span className="font-medium">{e.name}</span> <span className="muted">· {e.context} · {e.statusLabel}</span></span>
            <span className="muted shrink-0">{fmtDate(e.dueDate)} ({when(today, e.dueDate)})</span>
          </li>
        ))}
      </ul>
    );

  return (
    <>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="space-y-2"><h1>Laporan mingguan · {project.name}</h1><ProjectSummary project={project} /><p className="muted text-sm">Per {fmtDate(today)}</p></div>
        <ReportActions summary={summaryText(project.name, today, t)} />
      </div>
      <section className="card">
        <h2 className="mb-2">Ringkasan</h2>
        <p className="text-sm">
          Hari ini <b>{t.dueToday.length}</b> · Terlambat <b>{t.late.length}</b> · 7 hari ke depan <b>{t.next7.length}</b> · Deliverables <b>{t.deliverables.done} / {t.deliverables.total}</b> terkirim · Menunggu review <b>{t.review.length}</b>
        </p>
      </section>
      <section className="card">
        <h2 className="mb-2">Progres per track</h2>
        {report.tracks.length === 0 && <p className="muted text-sm">Belum ada track.</p>}
        <div className="space-y-4">
          {report.tracks.map((tr) => (
            <div key={tr.id}>
              <h3 className="mb-1 font-medium">{tr.name}</h3>
              <table className="w-full text-sm">
                <thead><tr className="muted text-left"><th className="py-1 font-normal">Fase</th><th className="py-1 font-normal">Status</th><th className="py-1 font-normal">Due</th><th className="py-1 text-right font-normal">Selisih baseline</th></tr></thead>
                <tbody className="divide-y divide-line">
                  {tr.phases.map((p) => (
                    <tr key={p.id}>
                      <td className={`py-1 ${p.milestone ? "muted pl-4" : ""}`}>{p.name}</td>
                      <td className="py-1">{p.statusLabel}</td>
                      <td className={`py-1 ${p.late ? "text-danger" : ""}`}>{fmtDate(p.dueDate)}</td>
                      <td className={`py-1 text-right ${p.slip > 0 ? "text-danger" : p.slip < 0 ? "text-ok" : "muted"}`}>{p.slip === 0 ? "sesuai" : p.slip > 0 ? `+${p.slip} hari` : `${p.slip} hari`}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ))}
        </div>
      </section>
      <section className="card"><h2 className="mb-2">Terlambat</h2>{entries(t.late, "Tidak ada yang terlambat.")}</section>
      <section className="card"><h2 className="mb-2">7 hari ke depan</h2>{entries(t.next7, "Tidak ada deadline dalam 7 hari.")}</section>
      <section className="card">
        <h2 className="mb-2">Deliverables</h2>
        <p className="text-sm">{t.deliverables.done} / {t.deliverables.total} terkirim</p>
      </section>
      <section className="card">
        <h2 className="mb-2">Menunggu review</h2>
        {t.review.length === 0 ? <p className="muted text-sm">Tidak ada link yang menunggu review.</p> : (
          <ul className="divide-y divide-line">
            {t.review.map((a) => (
              <li key={a.id} className="py-1.5 text-sm"><span className="font-medium">{a.label}</span> <span className="tag tag-accent">v{a.number}</span> <span className="muted">· {a.where} · {a.statusLabel}</span></li>
            ))}
          </ul>
        )}
      </section>
      <section className="card">
        <h2 className="mb-2">Perubahan 7 hari terakhir</h2>
        {report.activity.length === 0 ? <p className="muted text-sm">Tidak ada perubahan.</p> : (
          <ul className="divide-y divide-line">
            {report.activity.map((a) => (
              <li key={a.id} className="py-1.5 text-sm"><span className="muted">{stamp.format(new Date(a.createdAt))} · </span><span className="font-medium">{a.userName}</span> <span className="muted">·</span> {a.summary}</li>
            ))}
          </ul>
        )}
      </section>
    </>
  );
}
