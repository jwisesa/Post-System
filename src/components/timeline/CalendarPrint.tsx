import { fmtRange } from "@/lib/schedule/dates";
import { statusLabel } from "@/lib/schedule/templates";
import { isOff, type Cal } from "@/lib/schedule/workdays";
import { DOW, HEAD, LANE, monthFmt, monthWeeks } from "./calendar-layout";
import type { Item } from "./shared";

/** One printable month: server-rendered, no interaction. Milestones are diamonds with their names. */
export function CalendarMonth({ items, month, cal, ph }: { items: Item[]; month: string; cal: Cal; ph: (id: string) => number }) {
  const weeks = monthWeeks(items, month);
  return (
    <section className="print-month space-y-2">
      <h2 className="font-display text-lg font-semibold capitalize">{monthFmt.format(new Date(`${month}T00:00:00Z`))}</h2>
      <div className="grid gap-px overflow-hidden bg-line">
        <div className="grid grid-cols-7 gap-px">
          {DOW.map((n) => <div key={n} className="bg-raised px-2 py-1 text-xs font-semibold">{n}</div>)}
        </div>
        {weeks.map((w) => (
          <div key={w.key} className="relative grid grid-cols-7 gap-px">
            {w.days.map(({ d, miles }) => (
              <div key={d} className={`min-w-0 px-1 pb-1 ${isOff(cal, d) ? "bg-[var(--weekend)]" : "bg-bg"} ${d.slice(0, 7) !== month.slice(0, 7) ? "opacity-40" : ""}`} style={{ minHeight: 84, paddingTop: HEAD + w.lanes * LANE + 2 }}>
                {miles.map((m) => (
                  <div key={m.id} className="flex items-center gap-1.5 py-px text-[10px] leading-tight">
                    <span className="diamond" data-ph={ph(m.id)} />
                    <span className="min-w-0 break-words">{m.name}</span>
                  </div>
                ))}
              </div>
            ))}
            <div className="pointer-events-none absolute inset-0">
              {w.days.map(({ d }, c) => (
                <div key={d} className="absolute top-0.5 flex items-baseline gap-1 px-1 text-[10px] font-semibold leading-4" style={{ left: `${(c / 7) * 100}%`, width: `${100 / 7}%` }}>
                  <span className="tabular-nums">{Number(d.slice(8))}</span>
                  {cal.holidays.has(d) && <span className="truncate text-[8px]">{cal.holidays.get(d)}</span>}
                </div>
              ))}
              {w.segs.map(({ item, col, span, lane }) => (
                <div key={item.id} title={`${item.name}, ${fmtRange(item.startDate, item.dueDate)}, ${statusLabel(item.status)}`} className="span-bar absolute" data-ph={ph(item.id)} data-status={item.status}
                  style={{ left: `calc(${(col / 7) * 100}% + 2px)`, width: `calc(${(span / 7) * 100}% - 4px)`, top: HEAD + lane * LANE, height: LANE - 2, "--p": 0 } as React.CSSProperties}>
                  <span>{item.name}</span>
                </div>
              ))}
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}
