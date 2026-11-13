import Link from "next/link";
import { diffDays, fmtDate, fmtRange } from "@/lib/schedule/dates";
import type { TodayData, TodayEntry } from "@/lib/today/service";

export const when = (today: string, d: string) => {
  const n = diffDays(today, d);
  return n === 0 ? "hari ini" : n === 1 ? "besok" : n > 0 ? `${n} hari lagi` : `${-n} hari lalu`;
};

const short = (d: string) => fmtDate(d).replace(/ \d{4}$/, "");
const hr = (s: string) => s.replace(" hari", " hr");
const DOW = ["Sen", "Sel", "Rab", "Kam", "Jum", "Sab", "Min"];
const DUE_CAP = 8;
const LANES = 3;

/** Deliverables count and meter; sits at the end of the page header (and under the title in the view-only tab). */
export function DeliverablesMeter({ data, href }: { data: TodayData; href?: string }) {
  const { total, done } = data.deliverables;
  const label = <span className="text-[13px] font-semibold">Deliverables</span>;
  return (
    <div className="w-full space-y-1.5 md:w-64">
      <div className="flex items-baseline justify-between gap-2">
        {href ? <Link href={href} className="text-[13px] font-semibold hover:underline">Deliverables</Link> : label}
        <span className="num text-[13px] text-ink-2">{total === 0 ? "Belum ada" : `${done} / ${total} terkirim`}</span>
      </div>
      <div className="meter" role="progressbar" aria-label="Progres deliverables" aria-valuemin={0} aria-valuemax={total} aria-valuenow={done}>
        <span style={{ width: `${total ? Math.round((done / total) * 100) : 0}%` }} />
      </div>
    </div>
  );
}

export function DueRow({ e, today }: { e: TodayEntry; today: string }) {
  return (
    <li className="due-row" data-late={e.dueDate < today || undefined} data-today={e.dueDate === today || undefined}>
      <span className="due-date">{short(e.dueDate)}</span>
      <span className="due-name">
        {e.hardDeadline && <span className="tag tag-danger mr-1.5">Hard</span>}
        {e.name} <span className="due-ctx">· {e.kind === "deliverable" ? "Deliver · " : ""}{e.context} · {e.statusLabel}{e.picName && ` · ${e.picName}`}</span>
      </span>
      <span className="due-when">{hr(when(today, e.dueDate))}</span>
    </li>
  );
}

export function ListHead({ title, count, href, link }: { title: string; count?: number; href?: string; link?: string }) {
  return (
    <div className="list-head">
      <h2>{title} {count !== undefined && <span className="font-display ml-1 font-bold">{count}</span>}</h2>
      {href && <Link href={href} className="text-[13px] font-semibold underline underline-offset-2">{link}</Link>}
    </div>
  );
}

function WeekStrip({ week, today }: { week: TodayData["week"]; today: string }) {
  const col = (d: string) => Math.min(6, Math.max(0, diffDays(week.start, d)));
  // greedy lane packing, as in the calendar view
  const ends: number[] = [];
  const placed = [...week.phases].sort((a, b) => a.start.localeCompare(b.start)).map((bar) => {
    const [a, b] = [col(bar.start), col(bar.due)];
    let lane = ends.findIndex((end) => end < a);
    if (lane < 0) lane = ends.length;
    ends[lane] = b;
    return { bar, a, b, lane };
  });
  const hidden = ends.length > LANES ? placed.filter((p) => p.lane >= LANES - 1) : [];
  const shown = placed.filter((p) => !hidden.includes(p));
  const msByDay = new Map<string, TodayData["week"]["milestones"]>();
  for (const m of week.milestones) msByDay.set(m.due, [...(msByDay.get(m.due) ?? []), m]);
  return (
    <div className="week-strip" role="group" aria-label="Minggu ini">
      {week.days.map((d, c) => (
        <div key={d.date} className="week-day" style={{ gridColumn: c + 1 }} data-today={d.date === today || undefined} data-off={d.off || undefined}>
          <span className="week-dow">{d.date === today ? "Hari ini" : DOW[c]}</span>
          <span className="week-dnum">{Number(d.date.slice(8))}</span>
        </div>
      ))}
      {shown.map(({ bar, a, b, lane }) => (
        <span
          key={bar.id}
          className="span-bar"
          data-ph={bar.ph}
          data-status={bar.status}
          data-cont={[bar.start < week.start && "start", bar.due > week.end && "end"].filter(Boolean).join(" ") || undefined}
          title={`${bar.name} · ${fmtRange(bar.start, bar.due)}`}
          style={{ gridColumn: `${a + 1} / ${b + 2}`, gridRow: lane + 2, "--p": bar.p } as React.CSSProperties}
        >
          <span>{bar.name}</span>
        </span>
      ))}
      {hidden.length > 0 && (
        <span className="z-[1] px-2 text-xs font-semibold text-ink-2" style={{ gridColumn: "1 / -1", gridRow: LANES + 1 }}>+{hidden.length} fase lainnya</span>
      )}
      {[...msByDay].map(([date, list]) => (
        <span key={date} className="week-ms" data-ph={list[0].ph} title={list.map((m) => m.name).join(", ")} style={{ gridColumn: col(date) + 1, gridRow: 5 }}>
          <span className="diamond" />
          <span>{list[0].name}{list.length > 1 && ` +${list.length - 1}`}</span>
        </span>
      ))}
    </div>
  );
}

/** Open feedback points still to be cross-checked: top 5, grouped by the milestone they were raised at. */
function FeedbackList({ groups, base }: { groups: TodayData["feedback"]; base?: string }) {
  const total = groups.reduce((n, g) => n + g.count, 0);
  const before = (n: number) => groups.slice(0, n).reduce((a, g) => a + g.points.length, 0);
  const shown = groups.map((g, n) => ({ ...g, pts: g.points.slice(0, Math.max(0, 5 - before(n))) })).filter((g) => g.pts.length);
  return (
    <section>
      <ListHead title="Feedback belum dicek" count={total} href={base ? `${base}/timeline` : undefined} link="Timeline" />
      <ul>
        {shown.map((g) => (
          <li key={g.id}>
            <div className="due-row">
              <span className="due-date">{short(g.dueDate)}</span>
              <span className="due-name">{g.name} <span className="due-ctx">· {g.track}</span></span>
              <span className="due-when">{g.count} poin</span>
            </div>
            <ul className="pb-1 ps-[4.25rem] text-[13px] text-ink-2">
              {g.pts.map((p) => <li key={p.id} className="truncate">{p.ref && <span className="tabular-nums">{p.ref} </span>}{p.body}</li>)}
            </ul>
          </li>
        ))}
      </ul>
      {total > 5 && <p className="mt-1 px-1 text-[13px] text-ink-2">+{total - 5} poin lainnya</p>}
    </section>
  );
}

function Stat({ base, tone, empty, children }: { base?: string; tone?: string; empty?: boolean; children: React.ReactNode }) {
  const p = { className: "stat", "data-tone": tone, "data-empty": empty || undefined };
  return base === undefined ? <div {...p}>{children}</div> : <Link href={`${base}/timeline`} {...p}>{children}</Link>;
}

/** The one-screen "Hari Ini". `base` (project admin path) makes the key numbers links; `aside` fills the right column. */
export function TodayBoard({ data, today, base, aside }: { data: TodayData; today: string; base?: string; aside?: React.ReactNode }) {
  const due = [...data.late, ...data.dueToday, ...data.next7];
  const hard = data.hardDeadlines[0];
  const oldest = data.late[0];
  const lateDays = oldest ? -diffDays(today, oldest.dueDate) : 0;
  const week = { phases: data.next7.filter((e) => e.kind === "item").length, deliverables: data.next7.filter((e) => e.kind === "deliverable").length };
  return (
    <div className="space-y-4">
      <div className="stats">
        <Stat base={base} tone="danger" empty={!data.late.length}>
          <span className="stat-label">Terlambat</span>
          <span className="stat-num">{data.late.length}</span>
          <span className="stat-sub">{oldest ? `Paling lama: ${oldest.name}, ${lateDays} hr` : "Tidak ada yang terlambat"}</span>
        </Stat>
        <Stat base={base} tone="today" empty={!data.dueToday.length}>
          <span className="stat-label">Hari ini</span>
          <span className="stat-num">{data.dueToday.length}</span>
          <span className="stat-sub">{data.dueToday.length ? data.dueToday.slice(0, 2).map((e) => e.name).join(", ") : "Tidak ada yang due hari ini"}</span>
        </Stat>
        <Stat base={base}>
          <span className="stat-label">7 hari ke depan</span>
          <span className="stat-num">{data.next7.length}</span>
          <span className="stat-sub">{data.next7.length ? `${week.phases} fase · ${week.deliverables} deliverable` : "Tidak ada deadline"}</span>
        </Stat>
        <Stat base={base} tone="hard" empty={!hard}>
          <span className="stat-label">Hard deadline berikutnya</span>
          <span className="stat-num">{hard ? <>{hard.daysLeft}<small>hari</small></> : 0}</span>
          <span className="stat-sub">{hard ? `${hard.name} · ${short(hard.dueDate)}` : "Tidak ada hard deadline mendatang"}</span>
        </Stat>
      </div>

      <WeekStrip week={data.week} today={today} />

      <div className="grid grid-cols-[minmax(0,1fr)] gap-x-8 gap-y-6 pt-2 md:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
        <section className="min-w-0">
          <ListHead title="Jatuh tempo" count={due.length} href={base ? `${base}/timeline` : undefined} link="Timeline" />
          {due.length === 0 ? <p className="py-2 text-[13px] text-ink-2">Tidak ada deadline dalam 7 hari.</p> : (
            <ul>{due.slice(0, DUE_CAP).map((e) => <DueRow key={`${e.kind}-${e.id}`} e={e} today={today} />)}</ul>
          )}
          {due.length > DUE_CAP && (
            base ? <Link href={`${base}/timeline`} className="mt-1 block px-1 text-[13px] font-semibold underline underline-offset-2">+{due.length - DUE_CAP} lainnya, lihat Timeline</Link>
              : <p className="mt-1 px-1 text-[13px] text-ink-2">+{due.length - DUE_CAP} lainnya</p>
          )}
        </section>
        <div className="min-w-0 space-y-6">
          {data.feedback.length > 0 && <FeedbackList groups={data.feedback} base={base} />}
          {aside}
        </div>
      </div>
    </div>
  );
}

/** View-only tab: same board, no follow-up column; the right column lists upcoming hard deadlines instead. */
export function TodayCards({ data, today }: { data: TodayData; today: string }) {
  return (
    <div className="space-y-4">
      <DeliverablesMeter data={data} />
      <TodayBoard
        data={data}
        today={today}
        aside={
          <section>
            <ListHead title="Hard deadline" count={data.hardDeadlines.length} />
            {data.hardDeadlines.length === 0 ? <p className="py-2 text-[13px] text-ink-2">Tidak ada hard deadline mendatang.</p> : (
              <ul>
                {data.hardDeadlines.slice(0, 6).map((h) => (
                  <li key={h.id} className="due-row" data-today={h.daysLeft === 0 || undefined}>
                    <span className="due-date">{short(h.dueDate)}</span>
                    <span className="due-name">{h.name} <span className="due-ctx">· {h.track}</span></span>
                    <span className="due-when">{h.daysLeft === 0 ? "hari ini" : `${h.daysLeft} hr lagi`}</span>
                  </li>
                ))}
              </ul>
            )}
          </section>
        }
      />
    </div>
  );
}
