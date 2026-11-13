"use client";

import { useMemo, useState } from "react";
import { fmtRange } from "@/lib/schedule/dates";
import { statusLabel } from "@/lib/schedule/templates";
import { isOff, type Cal } from "@/lib/schedule/workdays";
import { DOW, HEAD, LANE, monthFmt, monthWeeks } from "./calendar-layout";
import { type Item, type Track } from "./shared";

export type ViewProps = {
  tracks: Track[];
  today: string;
  cal: Cal;
  ph: (itemId: string) => number;
  progress: (itemId: string) => number;
  onOpen: (itemId: string) => void;
};

const titleOf = (i: Item) => `${i.name}, ${fmtRange(i.startDate, i.dueDate)}, ${statusLabel(i.status)}`;

const Chevron = ({ dir }: { dir: "l" | "r" }) => (
  <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" aria-hidden>
    <path d={dir === "l" ? "M10 3 5 8l5 5" : "M6 3l5 5-5 5"} />
  </svg>
);

export default function CalendarView({ tracks, today, cal, ph, progress, onOpen }: ViewProps) {
  const items = useMemo(() => tracks.flatMap((t) => t.items), [tracks]);
  const [month, setMonth] = useState(() => {
    const first = items.reduce((m, i) => (i.startDate < m ? i.startDate : m), "9999-99-99");
    return (first > today ? first : today).slice(0, 7) + "-01";
  });
  const step = (n: number) => {
    const d = new Date(`${month}T00:00:00Z`);
    d.setUTCMonth(d.getUTCMonth() + n);
    setMonth(d.toISOString().slice(0, 10));
  };

  const weeks = useMemo(() => monthWeeks(items, month), [items, month]);

  return (
    <div className="text-ink">
      <div className="mb-3 flex items-center gap-2">
        <button type="button" className="btn-ghost" onClick={() => step(-1)} aria-label="Bulan sebelumnya"><Chevron dir="l" /></button>
        <h2 className="min-w-40 text-center font-display text-lg font-semibold capitalize">{monthFmt.format(new Date(`${month}T00:00:00Z`))}</h2>
        <button type="button" className="btn-ghost" onClick={() => step(1)} aria-label="Bulan berikutnya"><Chevron dir="r" /></button>
        <button type="button" className="btn-secondary" onClick={() => setMonth(today.slice(0, 7) + "-01")}>Hari ini</button>
      </div>
      <div className="grid gap-px overflow-hidden rounded-xl bg-line">
        <div className="grid grid-cols-7 gap-px">
          {DOW.map((n) => <div key={n} className="bg-raised px-2 py-1 text-xs font-semibold text-ink-2">{n}</div>)}
        </div>
        {weeks.map((w) => (
          <div key={w.key} className="relative grid grid-cols-7 gap-px">
            {w.days.map(({ d, miles }) => (
              <div
                key={d}
                className={`min-w-0 px-1 pb-1 ${d === today ? "bg-sel" : isOff(cal, d) ? "bg-[var(--weekend)]" : "bg-bg"} ${d.slice(0, 7) !== month.slice(0, 7) ? "opacity-50" : ""}`}
                style={{ minHeight: 72, paddingTop: HEAD + w.lanes * LANE + 2 }}
              >
                {miles.slice(0, 3).map((m) => (
                  <button key={m.id} type="button" title={titleOf(m)} onClick={() => onOpen(m.id)} className="flex w-full items-center gap-1.5 py-0.5 text-left text-[11px]">
                    <span className="diamond" data-ph={ph(m.id)} />
                    <span className="truncate">{m.name}</span>
                  </button>
                ))}
                {miles.length > 3 && <div className="text-[11px] text-ink-2">+{miles.length - 3} lagi</div>}
              </div>
            ))}
            <div className="pointer-events-none absolute inset-0">
              {w.days.map(({ d }, c) => (
                <div key={d} className="absolute top-0.5 flex items-baseline gap-1 px-1 text-[11px] font-semibold leading-4 text-ink-2" style={{ left: `${(c / 7) * 100}%`, width: `${100 / 7}%` }}>
                  <span className={`tabular-nums ${d === today ? "grid size-5 place-items-center rounded-sm bg-accent font-bold text-accent-ink" : ""}`}>{Number(d.slice(8))}</span>
                  {cal.holidays.has(d) && <span className="truncate text-[9px]">{cal.holidays.get(d)}</span>}
                </div>
              ))}
              {w.segs.map(({ item, col, span, lane }) => (
                <button
                  key={item.id}
                  type="button"
                  title={titleOf(item)}
                  onClick={() => onOpen(item.id)}
                  className="span-bar pointer-events-auto absolute"
                  data-ph={ph(item.id)}
                  data-status={item.status}
                  style={{ left: `calc(${(col / 7) * 100}% + 2px)`, width: `calc(${(span / 7) * 100}% - 4px)`, top: HEAD + lane * LANE, height: LANE - 2, "--p": progress(item.id) } as React.CSSProperties}
                >
                  <span>{item.name}</span>
                </button>
              ))}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
