"use client";

import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { addDays, diffDays, fmtRange } from "@/lib/schedule/dates";
import { statusLabel } from "@/lib/schedule/templates";
import { isOff } from "@/lib/schedule/workdays";
import { Icon } from "../ui/icons";
import type { ViewProps } from "./CalendarView";
import type { Item } from "./shared";

const DAY_MIN = 6, DAY_MAX = 40, DAY_DEFAULT = 14;
const clampDay = (n: number) => Math.min(DAY_MAX, Math.max(DAY_MIN, Math.round(n)));
const AXIS = 72;
const COL = 132;
const HEAD = 56; // two header rows, 28px each
const monthFmt = new Intl.DateTimeFormat("id-ID", { month: "short", year: "numeric", timeZone: "UTC" });
const titleOf = (i: Item) => `${i.name}, ${fmtRange(i.startDate, i.dueDate)}, ${statusLabel(i.status)}`;
const gridOf = (d: number) => `repeating-linear-gradient(to bottom, transparent 0, transparent ${d - 1}px, var(--grid) ${d - 1}px, var(--grid) ${d}px)`;

export default function VerticalGantt({ tracks, today, cal, ph, progress, onOpen }: ViewProps) {
  const box = useRef<HTMLDivElement>(null);
  const [DAY, setDay] = useState(DAY_DEFAULT);
  const live = useRef(DAY_DEFAULT);
  const anchorY = useRef<{ day: number; ay: number } | null>(null);
  /** Day height; keeps the day under `ay` (pixels from the scroller's top) where it is. */
  const zoomTo = useCallback((next: number, ay?: number) => {
    const n = clampDay(next), el = box.current;
    if (n === live.current) return;
    if (el) { const a = ay ?? el.clientHeight / 2; anchorY.current = { day: (el.scrollTop + a - HEAD) / live.current, ay: a }; }
    live.current = n;
    setDay(n);
  }, []);

  const g = useMemo(() => {
    const all = tracks.flatMap((t) => t.items);
    const first = all.reduce((m, i) => (i.startDate < m ? i.startDate : m), "9999-99-99");
    const last = all.reduce((m, i) => (i.dueDate > m ? i.dueDate : m), "0000-00-00");
    const min = all.length ? addDays(first, -7) : addDays(today, -7);
    const max = all.length ? addDays(last, 14) : addDays(today, 60);
    const phases: { item: Item; col: number; miles: Item[] }[] = [];
    const heads = tracks.map((t) => {
      const ps = t.items.filter((i) => !i.parentId);
      for (const p of ps) phases.push({ item: p, col: phases.length, miles: t.items.filter((m) => m.parentId === p.id) });
      return { id: t.id, name: t.name, n: ps.length };
    });
    const days = Array.from({ length: diffDays(min, max) + 1 }, (_, k) => addDays(min, k));
    return { min, days, phases, heads, anchor: all.length && first > today ? first : today };
  }, [tracks, today]);

  useEffect(() => {
    box.current?.scrollTo({ top: Math.max(0, diffDays(g.min, g.anchor) * live.current - 24) });
  }, [g.min, g.anchor]);

  useLayoutEffect(() => {
    const a = anchorY.current;
    anchorY.current = null;
    if (a) box.current?.scrollTo({ top: Math.max(0, a.day * DAY + HEAD - a.ay), behavior: "instant" });
  }, [DAY]);

  // ctrl/cmd + wheel (also a trackpad pinch) zooms around the pointer; two touches pinch. Native listeners: React's are passive.
  useEffect(() => {
    const el = box.current;
    if (!el) return;
    const ptrs = new Map<number, number>();
    let pinch: { d0: number; v0: number } | null = null;
    const gap = () => { const [a, b] = [...ptrs.values()]; return Math.abs(a - b) || 1; };
    const mid = () => [...ptrs.values()].reduce((s, y) => s + y, 0) / ptrs.size - el.getBoundingClientRect().top;
    const onWheel = (e: WheelEvent) => {
      if (!e.ctrlKey && !e.metaKey) return;
      e.preventDefault();
      zoomTo(live.current * Math.exp(-e.deltaY * 0.0025), e.clientY - el.getBoundingClientRect().top);
    };
    const down = (e: PointerEvent) => { if (e.pointerType !== "touch") return; ptrs.set(e.pointerId, e.clientY); pinch = ptrs.size === 2 ? { d0: gap(), v0: live.current } : null; };
    const move = (e: PointerEvent) => { if (!ptrs.has(e.pointerId)) return; ptrs.set(e.pointerId, e.clientY); if (pinch && ptrs.size === 2) zoomTo(pinch.v0 * (gap() / pinch.d0), mid()); };
    const up = (e: PointerEvent) => { ptrs.delete(e.pointerId); pinch = null; };
    const touch = (e: TouchEvent) => { if (e.touches.length === 2) e.preventDefault(); };
    el.addEventListener("wheel", onWheel, { passive: false });
    el.addEventListener("pointerdown", down);
    el.addEventListener("pointermove", move);
    el.addEventListener("pointerup", up);
    el.addEventListener("pointercancel", up);
    el.addEventListener("touchmove", touch, { passive: false });
    return () => { el.removeEventListener("wheel", onWheel); el.removeEventListener("pointerdown", down); el.removeEventListener("pointermove", move); el.removeEventListener("pointerup", up); el.removeEventListener("pointercancel", up); el.removeEventListener("touchmove", touch); };
  }, [zoomTo]);

  const W = g.phases.length * COL;
  const H = g.days.length * DAY;
  const todayY = diffDays(g.min, today) * DAY;

  return (
    <div>
      <div role="group" aria-label="Zoom" className="mb-2 flex items-center gap-1">
        <button type="button" className="btn-ghost !px-1.5" aria-label="Perkecil" title="Perkecil (Ctrl/Cmd + roda mouse)" disabled={DAY <= DAY_MIN} onClick={() => zoomTo(DAY * 0.8)}><Icon name="minus" /></button>
        <button type="button" className="btn-ghost !px-1.5" aria-label="Perbesar" title="Perbesar (Ctrl/Cmd + roda mouse)" disabled={DAY >= DAY_MAX} onClick={() => zoomTo(DAY * 1.25)}><Icon name="plus" /></button>
        <span className="muted text-xs tabular-nums" aria-live="polite">{DAY}px / hari</span>
      </div>
    <div ref={box} className="max-h-[72dvh] overflow-auto overscroll-contain rounded-xl bg-bg text-ink" style={{ touchAction: "pan-x pan-y" }}>
      <div style={{ width: AXIS + W, minWidth: "100%" }}>
        <div className="sticky top-0 z-30 flex bg-bg shadow-[0_6px_8px_-8px_rgb(16_40_30/0.25)]" style={{ height: HEAD }}>
          <div className="sticky left-0 z-10 shrink-0 bg-bg" style={{ width: AXIS }} />
          <div>
            <div className="flex h-7">
              {g.heads.map((t) => (
                <div key={t.id} className="track-band truncate px-2 text-xs leading-7" style={{ width: t.n * COL }}>{t.name}</div>
              ))}
            </div>
            <div className="flex h-7">
              {g.phases.map(({ item }) => (
                <div key={item.id} data-ph={ph(item.id)} className="flex items-center gap-1.5 bg-[var(--c-soft)] px-2 text-xs font-semibold text-[var(--c-text)]" style={{ width: COL }}>
                  <span className="ph-mark" />
                  <span className="truncate">{item.name}</span>
                </div>
              ))}
            </div>
          </div>
        </div>
        <div className="flex">
          <div className="sticky left-0 z-20 shrink-0 bg-bg" style={{ width: AXIS, height: H }}>
            {g.days.map((d, k) => {
              const dom = Number(d.slice(8));
              const mon = new Date(`${d}T00:00:00Z`).getUTCDay() === 1;
              if (dom !== 1 && !(mon && DAY >= 12)) return null;
              return (
                <div key={d} className="absolute left-0 w-full whitespace-nowrap px-1.5 text-[11px] leading-[14px] text-ink-2 tabular-nums" style={{ top: k * DAY }}>
                  {dom === 1 ? <span className="font-medium text-ink">{monthFmt.format(new Date(`${d}T00:00:00Z`))}</span> : dom}
                </div>
              );
            })}
          </div>
          <div className="relative" style={{ width: W, height: H, backgroundImage: gridOf(DAY) }}>
            {g.days.map((d, k) =>
              isOff(cal, d) ? <div key={d} className="absolute inset-x-0 bg-[var(--weekend)]" style={{ top: k * DAY, height: DAY }} /> : new Date(`${d}T00:00:00Z`).getUTCDay() === 1 ? <div key={d} className="absolute inset-x-0 border-t border-[var(--line)]" style={{ top: k * DAY }} /> : null,
            )}
            {g.phases.map(({ item, col, miles }) => (
              <div key={item.id}>
                <button
                  type="button"
                  title={titleOf(item)}
                  onClick={() => onOpen(item.id)}
                  className="span-bar absolute"
                  data-dir="v"
                  data-ph={ph(item.id)}
                  data-status={item.status}
                  style={{ left: col * COL + 6, width: COL - 12, top: diffDays(g.min, item.startDate) * DAY, height: (diffDays(item.startDate, item.dueDate) + 1) * DAY, "--p": progress(item.id) } as React.CSSProperties}
                />
                {miles.map((m) => (
                  <button
                    key={m.id}
                    type="button"
                    title={titleOf(m)}
                    onClick={() => onOpen(m.id)}
                    className="absolute z-10 flex items-center gap-1.5 text-left text-[11px] leading-[14px]"
                    style={{ left: col * COL + 6 - 4, top: diffDays(g.min, m.startDate) * DAY + 3, maxWidth: COL - 8 }}
                  >
                    <span className="diamond" data-ph={ph(m.id)} />
                    <span className="truncate bg-bg/90 px-1">{m.name}</span>
                  </button>
                ))}
              </div>
            ))}
            {todayY >= 0 && todayY < H && <div className="pointer-events-none absolute inset-x-0 z-20 h-0.5 bg-accent" style={{ top: todayY + DAY / 2 - 1 }} />}
          </div>
        </div>
      </div>
    </div>
    </div>
  );
}
