// Read-only timeline: one row per item, bars positioned across the project's date range.
import { addDays, diffDays, fmtDate, fmtRange, today as todayWib } from "@/lib/schedule/dates";
import type { Schedule } from "@/lib/schedule/service";
import { statusLabel } from "@/lib/schedule/templates";

type Item = Schedule["tracks"][number]["items"][number];

const BAR: Record<string, string> = {
  not_started: "bg-neutral-300",
  in_progress: "bg-blue-500",
  review: "bg-amber-500",
  done: "bg-emerald-500",
  on_hold: "bg-neutral-500",
};

export const isLate = (i: { dueDate: string; status: string }, today: string) => i.status !== "done" && i.dueDate < today;

/** "+3 hr" / "-2 hr" against the baseline due date, or "" when on plan. */
export function slip(i: { dueDate: string; baselineDue: string }) {
  const d = diffDays(i.baselineDue, i.dueDate);
  return d ? `${d > 0 ? "+" : ""}${d} hr` : "";
}

export function ItemBadges({ item, today }: { item: Item; today: string }) {
  return (
    <span className="space-x-1">
      {item.hardDeadline && <span className="tag bg-red-100 text-red-800">Hard deadline</span>}
      {isLate(item, today) && <span className="tag bg-red-600 text-white">Terlambat</span>}
      {slip(item) && <span className="tag bg-amber-100 text-amber-900">{slip(item)} dari baseline</span>}
      {item.internal && <span className="tag bg-amber-200">Internal</span>}
    </span>
  );
}

export function ScheduleView({ schedule }: { schedule: Schedule }) {
  const items = schedule.tracks.flatMap((t) => t.items);
  if (!items.length) return <p className="text-sm text-neutral-500">Belum ada jadwal.</p>;

  const today = todayWib();
  const min = addDays(items.map((i) => (i.baselineStart < i.startDate ? i.baselineStart : i.startDate)).sort()[0], -2);
  const max = addDays(items.map((i) => (i.baselineDue > i.dueDate ? i.baselineDue : i.dueDate)).sort().at(-1)!, 2);
  const total = diffDays(min, max) + 1;
  const pct = (n: number) => `${(n / total) * 100}%`;
  const span = (start: string, due: string) => ({ left: pct(diffDays(min, start)), width: pct(diffDays(start, due) + 1) });

  const months: { label: string; left: string }[] = [];
  for (let d = `${min.slice(0, 7)}-01`; d <= max; ) {
    const [y, m] = d.split("-").map(Number);
    if (d >= min) months.push({ label: new Intl.DateTimeFormat("id-ID", { month: "short", year: "2-digit", timeZone: "UTC" }).format(Date.parse(`${d}T00:00:00Z`)), left: pct(diffDays(min, d)) });
    d = m === 12 ? `${y + 1}-01-01` : `${y}-${String(m + 1).padStart(2, "0")}-01`;
  }
  const showToday = today >= min && today <= max;

  return (
    <div className="card overflow-x-auto">
      <div className="min-w-[48rem]">
        <div className="grid grid-cols-[15rem_1fr] text-xs text-neutral-500">
          <div />
          <div className="relative h-5 border-b border-neutral-200">
            {months.map((m) => (
              <span key={m.left} className="absolute border-l border-neutral-200 pl-1" style={{ left: m.left }}>{m.label}</span>
            ))}
          </div>
        </div>
        {schedule.tracks.map((t) => (
          <div key={t.id}>
            <div className="mt-3 text-sm font-semibold">{t.name}</div>
            {t.items.map((i) => (
              <div key={i.id} className="grid grid-cols-[15rem_1fr] items-center border-t border-neutral-100" title={`${i.name}: ${fmtRange(i.startDate, i.dueDate)} · ${statusLabel(i.status)}${i.picName ? ` · PIC ${i.picName}` : ""}`}>
                <div className={`truncate py-1 pr-2 text-sm ${i.parentId ? "pl-4 text-neutral-600" : ""}`}>
                  {i.parentId ? "◆ " : ""}{i.name}
                  {i.hardDeadline && <span className="ml-1 text-red-700" title="Hard deadline">●</span>}
                  <span className="ml-1 text-xs text-neutral-400">{fmtDate(i.dueDate).replace(/ \d{4}$/, "")}{slip(i) && ` (${slip(i)})`}</span>
                </div>
                <div className="relative h-7">
                  {showToday && <div className="absolute inset-y-0 w-px bg-red-400" style={{ left: pct(diffDays(min, today) + 0.5) }} />}
                  {(i.baselineStart !== i.startDate || i.baselineDue !== i.dueDate) && (
                    <div className="absolute bottom-0.5 h-1 rounded bg-neutral-300" style={span(i.baselineStart, i.baselineDue)} />
                  )}
                  <div
                    className={`absolute top-1.5 h-3.5 min-w-1.5 rounded ${BAR[i.status] ?? BAR.not_started} ${isLate(i, today) ? "ring-2 ring-red-500" : ""}`}
                    style={span(i.startDate, i.dueDate)}
                  />
                </div>
              </div>
            ))}
          </div>
        ))}
        <div className="mt-3 flex flex-wrap gap-3 text-xs text-neutral-500">
          {Object.keys(BAR).map((s) => (
            <span key={s} className="flex items-center gap-1"><span className={`inline-block h-2.5 w-4 rounded ${BAR[s]}`} />{statusLabel(s)}</span>
          ))}
          <span className="flex items-center gap-1"><span className="inline-block h-1 w-4 rounded bg-neutral-300" />Baseline</span>
          <span className="flex items-center gap-1"><span className="inline-block h-3 w-px bg-red-400" />Hari ini</span>
          <span className="flex items-center gap-1"><span className="inline-block h-2.5 w-4 rounded ring-2 ring-red-500" />Terlambat</span>
        </div>
      </div>
    </div>
  );
}
