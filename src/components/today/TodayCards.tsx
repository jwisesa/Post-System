import Link from "next/link";
import { diffDays, fmtDate } from "@/lib/schedule/dates";
import type { TodayData, TodayEntry } from "@/lib/today/service";

export const when = (today: string, d: string) => {
  const n = diffDays(today, d);
  return n === 0 ? "hari ini" : n === 1 ? "besok" : n > 0 ? `${n} hari lagi` : `${-n} hari lalu`;
};

function entryList(entries: TodayEntry[], today: string, empty: string) {
  if (entries.length === 0) return <p className="muted text-sm">{empty}</p>;
  return (
    <ul className="divide-y divide-line">
      {entries.map((e) => (
        <li key={`${e.kind}-${e.id}`} className="flex items-center justify-between gap-3 py-2 text-sm">
          <span className="min-w-0">
            {e.hardDeadline && <span className="tag tag-danger mr-1.5">Hard</span>}
            <span className="font-medium">{e.name}</span>{" "}
            <span className="muted">· {e.kind === "deliverable" ? "Deliver · " : ""}{e.context} · {e.statusLabel}{e.picName && ` · ${e.picName}`}</span>
          </span>
          <span className="muted shrink-0 text-right">{fmtDate(e.dueDate)} <span className={e.dueDate < today ? "text-danger" : ""}>({when(today, e.dueDate)})</span></span>
        </li>
      ))}
    </ul>
  );
}

/** Read-only cards shared by the admin dashboard and the view-only tab. */
export function TodayCards({ data, today, deliverablesHref }: { data: TodayData; today: string; deliverablesHref?: string }) {
  const { total, done } = data.deliverables;
  return (
    <>
      <div className="grid gap-4 lg:grid-cols-2">
        <section className="card">
          <h2 className="mb-2">Hari ini {data.dueToday.length > 0 && <span className="tag tag-accent ml-1">{data.dueToday.length}</span>}</h2>
          {entryList(data.dueToday, today, "Tidak ada yang due hari ini.")}
        </section>
        <section className="card">
          <h2 className="mb-2">Terlambat {data.late.length > 0 && <span className="tag tag-danger ml-1">{data.late.length}</span>}</h2>
          {entryList(data.late, today, "Tidak ada yang terlambat.")}
        </section>
      </div>
      <section className="card">
        <h2 className="mb-2">7 hari ke depan</h2>
        {entryList(data.next7, today, "Tidak ada deadline dalam 7 hari.")}
      </section>
      <div className="grid gap-4 lg:grid-cols-2">
        <section className="card">
          <h2 className="mb-2">Hard deadline berikutnya</h2>
          {data.hardDeadlines.length === 0 ? <p className="muted text-sm">Tidak ada hard deadline mendatang.</p> : (
            <ul className="divide-y divide-line">
              {data.hardDeadlines.map((h) => (
                <li key={h.id} className="flex items-center justify-between gap-3 py-2 text-sm">
                  <span className="min-w-0"><span className="font-medium">{h.name}</span> <span className="muted">· {h.track}</span></span>
                  <span className="shrink-0"><span className={`tag ${h.daysLeft <= 7 ? "tag-danger" : "tag-warn"}`}>{h.daysLeft === 0 ? "hari ini" : `${h.daysLeft} hari lagi`}</span> <span className="muted">{fmtDate(h.dueDate)}</span></span>
                </li>
              ))}
            </ul>
          )}
        </section>
        <section className="card">
          <div className="mb-2 flex items-center justify-between">
            <h2>Deliverables <span className="muted ml-1 text-sm font-normal">{done} / {total} terkirim</span></h2>
            {deliverablesHref && <Link href={deliverablesHref} className="text-sm text-accent">Semua deliverables</Link>}
          </div>
          {total === 0 ? <p className="muted text-sm">Belum ada deliverables.</p> : (
            <div className="h-1.5 overflow-hidden rounded-full bg-raised" role="progressbar" aria-valuemin={0} aria-valuemax={total} aria-valuenow={done}>
              <div className="h-full rounded-full bg-ok" style={{ width: `${Math.round((done / total) * 100)}%` }} />
            </div>
          )}
        </section>
      </div>
    </>
  );
}
