"use client";

import { useEffect, useMemo, useOptimistic, useRef, useState, useTransition } from "react";
import { linkItems, quickStatus, shiftItem, undoShift, unlinkItems } from "@/app/admin/timeline-client-actions";
import type { Attachment, Comment } from "@/lib/assets/service";
import { addDays, diffDays, fmtDate, fmtRange } from "@/lib/schedule/dates";
import type { DateMove, Schedule } from "@/lib/schedule/service";
import { computeShift, wouldCycle } from "@/lib/schedule/shift";
import { STATUSES, statusLabel } from "@/lib/schedule/templates";
import { Drawer } from "../ui/controls";
import { useToast } from "../ui/toast";
import { AgendaList, ItemPanel, ManagePanel, NewPhasePanel } from "./ItemPanel";
import { isLate, signed, slip, type Item, type Mode } from "./shared";

const ROW = 36;
const HEAD = 40;
const LEFT = 320;
const ZOOMS = [
  { id: "week", label: "Minggu", px: 30 },
  { id: "month", label: "Bulan", px: 12 },
  { id: "quarter", label: "Kuartal", px: 5 },
] as const;

type DragKind = "move" | "start" | "due";
type Drag = { id: string; kind: DragKind; x0: number; delta: number };
type Pending = { id: string; startDate: string; dueDate: string };
type Panel = { kind: "item"; id: string } | { kind: "new"; trackId: string; date: string } | { kind: "manage" };
type Optimistic = { type: "dates"; moves: DateMove[] } | { type: "status"; id: string; status: Item["status"] };

function candidate(item: Item, kind: DragKind, delta: number): Pending {
  let startDate = item.startDate;
  let dueDate = item.dueDate;
  if (kind !== "due") startDate = addDays(startDate, delta);
  if (kind !== "start") dueDate = addDays(dueDate, delta);
  if (startDate > dueDate) { if (kind === "start") startDate = dueDate; else dueDate = startDate; }
  return { id: item.id, startDate, dueDate };
}

type Props = {
  schedule: Schedule; mode: Mode; slug: string; today: string; contacts: { id: string; label: string }[];
  attachments: Attachment[]; comments?: Comment[]; me?: { id: string; role: string };
};

export function TimelineBoard({ schedule, mode, slug, today, contacts, attachments, comments = [], me }: Props) {
  const toast = useToast();
  const editable = mode === "edit";
  const [, startTransition] = useTransition();
  const [tracks, optimistic] = useOptimistic(schedule.tracks, (cur, a: Optimistic) =>
    cur.map((t) => ({
      ...t,
      items: t.items.map((i) => {
        if (a.type === "status") return i.id === a.id ? { ...i, status: a.status } : i;
        const m = a.moves.find((x) => x.id === i.id);
        return m ? { ...i, startDate: m.startDate, dueDate: m.dueDate } : i;
      }),
    })),
  );
  const deps = schedule.deps;

  const [zoom, setZoom] = useState<(typeof ZOOMS)[number]["id"]>("month");
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set());
  const [fStatus, setFStatus] = useState("");
  const [fPic, setFPic] = useState("");
  const [fLate, setFLate] = useState(false);
  const [fHard, setFHard] = useState(false);
  const [panel, setPanel] = useState<Panel | null>(null);
  const [drag, setDrag] = useState<Drag | null>(null);
  const [pending, setPending] = useState<Pending | null>(null);
  const [reason, setReason] = useState("");
  const [link, setLink] = useState<{ from: string; x: number; y: number } | null>(null);
  const scroller = useRef<HTMLDivElement>(null);
  const canvas = useRef<HTMLDivElement>(null);

  const px = ZOOMS.find((z) => z.id === zoom)!.px;
  const allItems = useMemo(() => tracks.flatMap((t) => t.items.map((i) => ({ ...i, trackName: t.name }))), [tracks]);
  const byId = useMemo(() => new Map(allItems.map((i) => [i.id, i])), [allItems]);

  // Fixed date range so the canvas does not re-layout while dragging.
  const [min, max] = useMemo(() => {
    if (!allItems.length) return [addDays(today, -7), addDays(today, 60)];
    const starts = allItems.map((i) => (i.baselineStart < i.startDate ? i.baselineStart : i.startDate)).concat(today).sort();
    const dues = allItems.map((i) => (i.baselineDue > i.dueDate ? i.baselineDue : i.dueDate)).concat(today).sort();
    return [addDays(starts[0], -14), addDays(dues.at(-1)!, 45)];
  }, [allItems, today]);
  const total = diffDays(min, max) + 1;
  const width = total * px;
  const x = (d: string) => diffDays(min, d) * px;

  // What is being proposed right now (live drag, or a dropped change awaiting confirmation).
  const dragItem = drag ? byId.get(drag.id) : undefined;
  const proposal = drag && dragItem ? candidate(dragItem, drag.kind, drag.delta) : pending;
  const preview = useMemo(() => {
    if (!proposal) return null;
    try { return computeShift(allItems, deps, proposal.id, proposal.startDate, proposal.dueDate, true); } catch { return null; }
  }, [proposal, allItems, deps]);
  const moved = new Map(preview?.moves.map((m) => [m.id, m]));
  const at = (i: Item) => { const m = moved.get(i.id); return m ? { start: m.newStart, due: m.newDue } : { start: i.startDate, due: i.dueDate }; };

  const matches = (i: Item) => (!fStatus || i.status === fStatus) && (!fPic || i.picContactId === fPic) && (!fLate || isLate(i, today)) && (!fHard || i.hardDeadline);
  const filtering = Boolean(fStatus || fPic || fLate || fHard);
  const rows: ({ type: "track"; track: (typeof tracks)[number] } | { type: "item"; item: Item })[] = [];
  for (const t of tracks) {
    rows.push({ type: "track", track: t });
    if (!collapsed.has(t.id)) for (const i of t.items) if (matches(i)) rows.push({ type: "item", item: i });
  }
  const rowOf = new Map(rows.flatMap((r, n) => (r.type === "item" ? [[r.item.id, n] as const] : [])));

  // Open on today, or on the first item when the schedule has not started yet.
  const firstStart = allItems.map((i) => i.startDate).sort()[0];
  const focus = firstStart && firstStart > today ? firstStart : today;
  useEffect(() => {
    const el = scroller.current;
    if (el) el.scrollLeft = Math.max(0, diffDays(min, focus) * px - 160);
  }, [min, focus, px]);

  useEffect(() => {
    if (!drag && !pending && !link) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") { setDrag(null); setPending(null); setLink(null); } };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [drag, pending, link]);

  // ---------- actions ----------

  function commit(cascade: boolean) {
    if (!pending) return;
    const p = pending;
    const item = byId.get(p.id)!;
    const result = computeShift(allItems, deps, p.id, p.startDate, p.dueDate, cascade);
    const note = reason;
    setPending(null);
    setReason("");
    startTransition(async () => {
      optimistic({ type: "dates", moves: result.moves.map((m) => ({ id: m.id, startDate: m.newStart, dueDate: m.newDue })) });
      const r = await shiftItem(slug, p.id, p.startDate, p.dueDate, cascade, note);
      if (!r.ok) return toast({ message: r.error, tone: "error" });
      const others = r.undo.length - 1;
      toast({
        message: `Jadwal "${item.name}" diubah${others > 0 ? `, ${others} item ikut bergeser` : ""}.`,
        action: {
          label: "Urungkan",
          run: () => startTransition(async () => {
            optimistic({ type: "dates", moves: r.undo });
            const u = await undoShift(slug, r.undo);
            toast(u.ok ? { message: "Perubahan jadwal diurungkan." } : { message: u.error, tone: "error" });
          }),
        },
      });
    });
  }

  function setStatus(item: Item, status: string) {
    startTransition(async () => {
      optimistic({ type: "status", id: item.id, status: status as Item["status"] });
      const r = await quickStatus(slug, item.id, status);
      toast(r.ok ? { message: `"${item.name}" → ${statusLabel(status)}.` } : { message: r.error, tone: "error" });
    });
  }

  function addLink(itemId: string, dependsOnId: string) {
    const [a, b] = [byId.get(itemId), byId.get(dependsOnId)];
    if (!a || !b || itemId === dependsOnId) return;
    if (deps.some((d) => d.itemId === itemId && d.dependsOnId === dependsOnId)) return toast({ message: "Dependency itu sudah ada." });
    if (wouldCycle(deps, itemId, dependsOnId)) return toast({ message: `"${b.name}" sudah bergantung pada "${a.name}"; dependency ini akan berputar.`, tone: "error" });
    startTransition(async () => {
      const r = await linkItems(slug, itemId, dependsOnId);
      toast(r.ok ? { message: `"${a.name}" kini menunggu "${b.name}".` } : { message: r.error, tone: "error" });
    });
  }

  function removeLink(itemId: string, dependsOnId: string) {
    startTransition(async () => {
      const r = await unlinkItems(slug, itemId, dependsOnId);
      toast(r.ok ? { message: "Dependency dilepas." } : { message: r.error, tone: "error" });
    });
  }

  // ---------- pointer handling ----------

  function dragHandlers(item: Item, kind: DragKind) {
    if (!editable) return { onClick: () => setPanel({ kind: "item", id: item.id }) };
    return {
      onPointerDown: (e: React.PointerEvent) => {
        if (e.button !== 0) return;
        e.stopPropagation();
        e.currentTarget.setPointerCapture(e.pointerId);
        setPending(null);
        setDrag({ id: item.id, kind, x0: e.clientX, delta: 0 });
      },
      onPointerMove: (e: React.PointerEvent) => {
        e.stopPropagation();
        setDrag((d) => (d && d.id === item.id ? { ...d, delta: Math.round((e.clientX - d.x0) / px) } : d));
      },
      onPointerUp: (e: React.PointerEvent) => {
        e.stopPropagation();
        if (!drag || drag.id !== item.id) return;
        if (drag.delta === 0) setPanel({ kind: "item", id: item.id });
        else setPending(candidate(item, drag.kind, drag.delta));
        setDrag(null);
      },
      onPointerCancel: () => setDrag(null),
    };
  }

  function linkHandlers(item: Item) {
    const point = (e: React.PointerEvent) => { const r = canvas.current!.getBoundingClientRect(); return { x: e.clientX - r.left, y: e.clientY - r.top }; };
    return {
      onPointerDown: (e: React.PointerEvent) => { e.stopPropagation(); e.currentTarget.setPointerCapture(e.pointerId); setLink({ from: item.id, ...point(e) }); },
      onPointerMove: (e: React.PointerEvent) => { e.stopPropagation(); setLink((l) => (l ? { ...l, ...point(e) } : l)); },
      onPointerUp: (e: React.PointerEvent) => {
        e.stopPropagation();
        const target = document.elementFromPoint(e.clientX, e.clientY)?.closest<HTMLElement>("[data-item-id]")?.dataset.itemId;
        setLink(null);
        if (target && target !== item.id) addLink(target, item.id);
      },
      onPointerCancel: () => setLink(null),
    };
  }

  function nudge(item: Item, days: number) {
    const base = pending?.id === item.id ? pending : { id: item.id, startDate: item.startDate, dueDate: item.dueDate };
    const next = { id: item.id, startDate: addDays(base.startDate, days), dueDate: addDays(base.dueDate, days) };
    setPending(next.startDate === item.startDate && next.dueDate === item.dueDate ? null : next);
  }

  // ---------- header ticks ----------

  const months: { key: string; label: string; left: number }[] = [];
  for (let d = `${min.slice(0, 7)}-01`; d <= max; ) {
    const [y, m] = d.split("-").map(Number);
    const next = m === 12 ? `${y + 1}-01-01` : `${y}-${String(m + 1).padStart(2, "0")}-01`;
    // A month that began before the visible range is labelled only if enough of it is showing.
    if (x(d) >= 0 || x(next) > 120) months.push({ key: d, label: new Intl.DateTimeFormat("id-ID", { month: zoom === "quarter" ? "short" : "long", year: "numeric", timeZone: "UTC" }).format(Date.parse(`${d}T00:00:00Z`)), left: Math.max(0, x(d)) });
    d = next;
  }
  const days = zoom === "quarter" ? [] : Array.from({ length: total }, (_, n) => addDays(min, n)).map((d) => ({ d, dow: new Date(`${d}T00:00:00Z`).getUTCDay() }));

  const linkCount = new Map<string, number>();
  for (const a of attachments) if (a.targetType === "schedule_item") linkCount.set(a.targetId, (linkCount.get(a.targetId) ?? 0) + 1);
  const panelItem = panel?.kind === "item" ? byId.get(panel.id) : undefined;
  const panelTrack = panelItem ? tracks.find((t) => t.id === panelItem.trackId) : panel?.kind === "new" ? tracks.find((t) => t.id === panel.trackId) : undefined;
  const pendingItem = pending ? byId.get(pending.id) : undefined;
  const others = preview ? preview.moves.filter((m) => m.id !== proposal?.id).length : 0;
  const conflictIds = new Set(preview?.conflictIds);
  const bodyHeight = rows.length * ROW;

  return (
    <div className="space-y-3">
      {/* toolbar */}
      <div className="flex flex-wrap items-center gap-2">
        <div role="group" aria-label="Zoom" className="hidden rounded-md border border-line bg-surface p-0.5 md:flex">
          {ZOOMS.map((z) => (
            <button key={z.id} type="button" aria-pressed={zoom === z.id} className={`cursor-pointer rounded px-2.5 py-1 text-sm ${zoom === z.id ? "bg-accent-soft font-medium text-accent" : "text-muted hover:text-ink"}`} onClick={() => setZoom(z.id)}>{z.label}</button>
          ))}
        </div>
        <button type="button" className="btn-secondary hidden md:inline-flex" onClick={() => scroller.current?.scrollTo({ left: Math.max(0, x(today) - 160), behavior: "smooth" })}>Hari ini</button>
        <select aria-label="Filter status" className="!w-auto" value={fStatus} onChange={(e) => setFStatus(e.target.value)}>
          <option value="">Semua status</option>
          {STATUSES.map((s) => <option key={s.value} value={s.value}>{s.label}</option>)}
        </select>
        {contacts.length > 0 && (
          <select aria-label="Filter PIC" className="!w-auto max-w-44" value={fPic} onChange={(e) => setFPic(e.target.value)}>
            <option value="">Semua PIC</option>
            {contacts.map((c) => <option key={c.id} value={c.id}>{c.label}</option>)}
          </select>
        )}
        <label className="check"><input type="checkbox" checked={fLate} onChange={(e) => setFLate(e.target.checked)} /> Terlambat</label>
        <label className="check"><input type="checkbox" checked={fHard} onChange={(e) => setFHard(e.target.checked)} /> Hard deadline</label>
        {editable && <button type="button" className="btn ml-auto" onClick={() => setPanel({ kind: "manage" })}>+ Track / kelola</button>}
      </div>

      {tracks.length === 0 ? (
        <div className="card text-sm">
          <p className="font-medium">Belum ada jadwal.</p>
          <p className="muted mt-1">{editable ? "Mulai dengan menambah track dari template, misalnya Main Feature atau Trailer." : "Jadwal belum dibuat."}</p>
          {editable && <button type="button" className="btn mt-3" onClick={() => setPanel({ kind: "manage" })}>+ Tambah track</button>}
        </div>
      ) : (
        <>
          {/* narrow screens: agenda */}
          <div className="md:hidden">
            <AgendaList tracks={tracks.map((t) => ({ ...t, items: t.items.filter(matches) }))} today={today} onOpen={(id) => setPanel({ kind: "item", id })} />
          </div>

          {/* board */}
          <div ref={scroller} className="card hidden max-h-[72vh] overflow-auto p-0 md:block" data-testid="timeline-board">
            <div className="relative" style={{ width: LEFT + width }}>
              <div className="sticky top-0 z-30 flex border-b border-line bg-surface" style={{ height: HEAD }}>
                <div className="sticky left-0 z-10 flex shrink-0 items-end border-r border-line bg-surface px-3 pb-1.5 text-xs font-medium text-muted" style={{ width: LEFT }}>
                  {filtering ? `${rowOf.size} dari ${allItems.length} item` : `${allItems.length} item`}
                </div>
                <div className="relative" style={{ width }}>
                  {months.map((m) => <div key={m.key} className="absolute top-1 border-l border-line pl-1.5 text-xs font-medium whitespace-nowrap" style={{ left: m.left }}>{m.label}</div>)}
                  {days.filter(({ d, dow }) => (zoom === "week" ? true : dow === 1) && d.slice(8) !== "01").map(({ d }) => (
                    <div key={d} className="muted absolute bottom-0.5 text-[10px] tabular-nums" style={{ left: x(d) + 2 }}>{Number(d.slice(8))}</div>
                  ))}
                </div>
              </div>

              <div ref={canvas} className="relative" style={{ height: bodyHeight }}>
                {/* backdrop: weekends, month lines, today */}
                <div className="pointer-events-none absolute inset-y-0" style={{ left: LEFT, width }}>
                  {days.filter(({ dow }) => dow === 0 || dow === 6).map(({ d }) => <div key={d} className="absolute inset-y-0 bg-raised/60" style={{ left: x(d), width: px }} />)}
                  {months.map((m) => <div key={m.key} className="absolute inset-y-0 border-l border-line" style={{ left: m.left }} />)}
                  <div className="absolute inset-y-0 z-10 w-0.5 bg-danger/70" style={{ left: x(today) + px / 2 }} title="Hari ini" />
                </div>

                {rows.map((r, n) =>
                  r.type === "track" ? (
                    <div key={r.track.id} className="absolute inset-x-0 flex border-b border-line bg-raised/70" style={{ top: n * ROW, height: ROW }}>
                      <div className="sticky left-0 z-20 flex shrink-0 items-center gap-1 border-r border-line bg-raised px-2" style={{ width: LEFT }}>
                        <button type="button" aria-expanded={!collapsed.has(r.track.id)} className="flex min-w-0 flex-1 cursor-pointer items-center gap-1.5 text-left text-sm font-semibold" onClick={() => setCollapsed((c) => { const s = new Set(c); if (!s.delete(r.track.id)) s.add(r.track.id); return s; })}>
                          <span aria-hidden className={`muted text-xs transition ${collapsed.has(r.track.id) ? "-rotate-90" : ""}`}>▾</span>
                          <span className="truncate">{r.track.name}</span>
                          <span className="muted text-xs font-normal">{r.track.items.length}</span>
                        </button>
                        {editable && <button type="button" className="btn-ghost !min-h-6 !px-1.5 text-xs" onClick={() => setPanel({ kind: "new", trackId: r.track.id, date: today })}>+ Fase</button>}
                      </div>
                      <div
                        className="flex-1"
                        title={editable ? "Klik dua kali untuk menambah fase di tanggal ini" : undefined}
                        onDoubleClick={editable ? (e) => { const left = e.currentTarget.getBoundingClientRect().left; setPanel({ kind: "new", trackId: r.track.id, date: addDays(min, Math.floor((e.clientX - left) / px)) }); } : undefined}
                      />
                    </div>
                  ) : (
                    renderRow(r.item, n * ROW)
                  ),
                )}

                {/* dependency arrows */}
                <svg className="pointer-events-none absolute top-0 z-10" style={{ left: LEFT, width, height: bodyHeight }} aria-hidden>
                  <defs>
                    <marker id="arrow" viewBox="0 0 8 8" refX="7" refY="4" markerWidth="7" markerHeight="7" orient="auto"><path d="M0,0 L8,4 L0,8 z" fill="context-stroke" /></marker>
                  </defs>
                  {deps.map((d) => {
                    const [a, b] = [byId.get(d.dependsOnId), byId.get(d.itemId)];
                    const [ra, rb] = [rowOf.get(d.dependsOnId), rowOf.get(d.itemId)];
                    if (!a || !b || ra === undefined || rb === undefined) return null;
                    const x1 = x(at(a).due) + px;
                    const x2 = x(at(b).start);
                    const y1 = ra * ROW + ROW / 2;
                    const y2 = rb * ROW + ROW / 2;
                    const path = x2 >= x1 + 12
                      ? `M${x1},${y1} H${x1 + 6} V${y2} H${x2 - 1}`
                      : `M${x1},${y1} H${x1 + 6} V${y2 - (y2 > y1 ? ROW / 2 : -ROW / 2)} H${x2 - 8} V${y2} H${x2 - 1}`;
                    const bad = at(a).due >= at(b).start;
                    return (
                      <g key={`${d.itemId}-${d.dependsOnId}`} className={bad ? "text-danger" : "text-muted"}>
                        <path d={path} fill="none" stroke="currentColor" strokeWidth={bad ? 1.5 : 1} opacity={bad ? 1 : 0.55} markerEnd="url(#arrow)" />
                        {editable && (
                          <path d={path} fill="none" stroke="transparent" strokeWidth={10} className="cursor-pointer" style={{ pointerEvents: "stroke" }} onClick={() => { if (window.confirm(`Lepas dependency: "${b.name}" menunggu "${a.name}"?`)) removeLink(d.itemId, d.dependsOnId); }}>
                            <title>{`"${b.name}" menunggu "${a.name}" — klik untuk melepas`}</title>
                          </path>
                        )}
                      </g>
                    );
                  })}
                  {link && byId.get(link.from) && rowOf.has(link.from) && (
                    <line x1={x(byId.get(link.from)!.dueDate) + px} y1={rowOf.get(link.from)! * ROW + ROW / 2} x2={link.x - LEFT} y2={link.y} stroke="var(--accent)" strokeWidth={2} strokeDasharray="4 3" />
                  )}
                </svg>
              </div>
            </div>
          </div>

          <div className="muted hidden flex-wrap gap-x-4 gap-y-1 text-xs md:flex">
            {STATUSES.map((s) => <span key={s.value} className="flex items-center gap-1.5"><span className="h-2.5 w-4 rounded" style={{ background: `var(--st-${s.value})` }} />{s.label}</span>)}
            <span className="flex items-center gap-1.5"><span className="h-1 w-4 rounded bg-line" />Baseline</span>
            <span className="flex items-center gap-1.5"><span className="h-3 w-0.5 bg-danger" />Hari ini</span>
            {editable && <span>Seret batang untuk memindah, ujungnya untuk memperpanjang, titik di kanan untuk membuat dependency. Panah ← → menggeser item terpilih.</span>}
          </div>
        </>
      )}

      {/* confirmation bar for a dropped change */}
      {pending && pendingItem && preview && (
        <div role="dialog" aria-label="Konfirmasi perubahan jadwal" className="fixed inset-x-0 bottom-4 z-50 mx-auto w-[min(44rem,calc(100%-2rem))] space-y-3 rounded-xl border border-line bg-surface p-4 shadow-2xl">
          <div className="text-sm">
            <span className="font-semibold">{pendingItem.name}</span>: {fmtRange(pendingItem.startDate, pendingItem.dueDate)} → <span className="font-semibold">{fmtRange(pending.startDate, pending.dueDate)}</span>{" "}
            <span className="tag tag-warn">due {diffDays(pendingItem.dueDate, pending.dueDate) ? signed(diffDays(pendingItem.dueDate, pending.dueDate)) : "tetap"}</span>
            {others > 0 && <span className="muted"> · {others} item yang bergantung ikut bergeser</span>}
          </div>
          {preview.conflicts.length > 0 && (
            <ul role="alert" className="list-disc rounded-lg bg-danger-soft py-2 pr-3 pl-7 text-sm text-danger">{preview.conflicts.map((c) => <li key={c}>{c}</li>)}</ul>
          )}
          <div className="flex flex-wrap items-center gap-2">
            <input className="min-w-40 flex-1" placeholder="Alasan perubahan (opsional)" aria-label="Alasan perubahan" value={reason} onChange={(e) => setReason(e.target.value)} onKeyDown={(e) => { if (e.key === "Enter") commit(true); }} />
            {others > 0 ? (
              <>
                <button type="button" className="btn" onClick={() => commit(true)}>Geser {others} item yang bergantung</button>
                <button type="button" className="btn-secondary" onClick={() => commit(false)}>Ubah ini saja</button>
              </>
            ) : (
              <button type="button" className="btn" onClick={() => commit(true)}>Terapkan</button>
            )}
            <button type="button" className="btn-ghost" onClick={() => { setPending(null); setReason(""); }}>Batal</button>
          </div>
        </div>
      )}

      {panel?.kind === "item" && panelItem && panelTrack && (
        <Drawer title={panelItem.name} onClose={() => setPanel(null)}>
          <ItemPanel item={panelItem} track={panelTrack} mode={mode} slug={slug} today={today} allItems={allItems} deps={deps} contacts={contacts} onLink={addLink} onUnlink={removeLink}
            attachments={attachments.filter((a) => a.targetType === "schedule_item" && a.targetId === panelItem.id)}
            comments={comments.filter((c) => c.targetType === "schedule_item" && c.targetId === panelItem.id)} me={me} />
        </Drawer>
      )}
      {panel?.kind === "new" && panelTrack && (
        <Drawer title="Fase baru" onClose={() => setPanel(null)}>
          <NewPhasePanel key={panel.date} slug={slug} track={panelTrack} date={panel.date} endDate={addDays(panel.date, 6)} />
        </Drawer>
      )}
      {panel?.kind === "manage" && (
        <Drawer title="Kelola timeline" onClose={() => setPanel(null)}>
          <ManagePanel slug={slug} tracks={tracks} today={today} hasItems={allItems.length > 0} />
        </Drawer>
      )}
    </div>
  );

  // Plain function, not a component: bars must keep their DOM node across renders for pointer capture.
  function renderRow(item: Item, top: number) {
    const p = at(item);
    const m = moved.get(item.id);
    const isSubject = proposal?.id === item.id;
    const late = isLate(item, today);
    const left = x(p.start);
    const w = (diffDays(p.start, p.due) + 1) * px;
    const milestone = Boolean(item.parentId);
    const label = `${item.name}, ${fmtRange(p.start, p.due)}, ${statusLabel(item.status)}`;
    return (
      <div key={item.id} className="group absolute inset-x-0 flex border-b border-line/60 hover:bg-raised/40" style={{ top, height: ROW }}>
        <div className={`sticky left-0 z-20 flex shrink-0 items-center gap-2 border-r border-line bg-surface px-2 ${milestone ? "pl-6" : ""}`} style={{ width: LEFT }}>
          <button type="button" className="min-w-0 flex-1 cursor-pointer truncate text-left text-sm hover:text-accent" onClick={() => setPanel({ kind: "item", id: item.id })}>
            {milestone && <span aria-hidden className="muted">◆ </span>}{item.name}
            {item.hardDeadline && <span className="ml-1 text-danger" title="Hard deadline">●</span>}
          </button>
          {linkCount.get(item.id) && <span className="tag tag-accent shrink-0 !px-1.5" title={`${linkCount.get(item.id)} link`}>↗{linkCount.get(item.id)}</span>}
          <span className={`shrink-0 text-xs tabular-nums ${late ? "font-medium text-danger" : "muted"}`} title={late ? "Terlambat" : undefined}>
            {fmtDate(p.due).replace(/ \d{4}$/, "")}{slip(item) && <span className="text-warn"> {slip(item)}</span>}
          </span>
          {mode === "view" ? (
            <span className="size-2.5 shrink-0 rounded-full" style={{ background: `var(--st-${item.status})` }} title={statusLabel(item.status)} />
          ) : (
            <select aria-label={`Status ${item.name}`} className="!w-[6.75rem] shrink-0 !px-1 !py-0.5 !text-xs" value={item.status} onChange={(e) => setStatus(item, e.target.value)}>
              {STATUSES.map((s) => <option key={s.value} value={s.value}>{s.label}</option>)}
            </select>
          )}
        </div>
        <div className="relative flex-1">
          {/* baseline, and where the bar was before the proposed change */}
          {(item.baselineStart !== item.startDate || item.baselineDue !== item.dueDate) && !milestone && (
            <div className="absolute bottom-1 h-1 rounded bg-line" style={{ left: x(item.baselineStart), width: (diffDays(item.baselineStart, item.baselineDue) + 1) * px }} />
          )}
          {m && <div className="absolute top-2 h-4 rounded border border-dashed border-muted/60" style={{ left: x(m.oldStart), width: (diffDays(m.oldStart, m.oldDue) + 1) * px }} />}
          <div
            data-item-id={item.id}
            role="button"
            tabIndex={0}
            aria-label={label}
            title={`${label}${item.picName ? `, PIC ${item.picName}` : ""}`}
            className={`absolute top-2 h-4 select-none ${milestone ? "" : "rounded"} ${editable ? "cursor-grab touch-none active:cursor-grabbing" : "cursor-pointer"} ${late ? "ring-2 ring-danger" : ""} ${conflictIds.has(item.id) ? "ring-2 ring-danger ring-offset-1" : ""} ${m && !isSubject ? "opacity-80 ring-2 ring-accent/50" : ""} ${isSubject ? "shadow-lg ring-2 ring-accent" : ""}`}
            style={milestone
              ? { left: left + px / 2 - 7, width: 14, height: 14, top: 11, transform: "rotate(45deg)", background: `var(--st-${item.status})` }
              : { left, width: Math.max(w, 6), background: `var(--st-${item.status})` }}
            onKeyDown={(e) => {
              if (e.key === "Enter" || e.key === " ") { e.preventDefault(); setPanel({ kind: "item", id: item.id }); }
              else if (editable && e.key === "ArrowRight") { e.preventDefault(); nudge(item, 1); }
              else if (editable && e.key === "ArrowLeft") { e.preventDefault(); nudge(item, -1); }
            }}
            {...dragHandlers(item, "move")}
          >
            {editable && !milestone && w >= 24 && (
              <>
                <span aria-hidden className="absolute inset-y-0 left-0 w-1.5 cursor-ew-resize rounded-l bg-black/15 opacity-0 group-hover:opacity-100" {...dragHandlers(item, "start")} />
                <span aria-hidden className="absolute inset-y-0 right-0 w-1.5 cursor-ew-resize rounded-r bg-black/15 opacity-0 group-hover:opacity-100" {...dragHandlers(item, "due")} />
              </>
            )}
          </div>
          {editable && !milestone && (
            <span
              aria-hidden
              title="Seret ke item lain untuk membuat dependency"
              data-link-handle={item.id}
              className="absolute top-[11px] z-20 size-2.5 cursor-crosshair touch-none rounded-full border-2 border-accent bg-surface opacity-0 group-hover:opacity-100"
              style={{ left: left + Math.max(w, 6) + 4 }}
              {...linkHandlers(item)}
            />
          )}
          {isSubject && drag && preview && (
            <div className="pointer-events-none absolute -top-0.5 z-20 rounded-md bg-ink px-2 py-0.5 text-xs whitespace-nowrap text-bg shadow" style={{ left: left + Math.max(w, 6) + 18 }}>
              {fmtRange(p.start, p.due)} · {signed(drag.delta)}{others > 0 && ` · ${others} item ikut`}{preview.conflicts.length > 0 && ` · ${preview.conflicts.length} bentrok`}
            </div>
          )}
        </div>
      </div>
    );
  }
}
