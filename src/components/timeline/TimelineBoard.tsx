"use client";

import { useEffect, useMemo, useOptimistic, useRef, useState, useTransition } from "react";
import { linkItems, moveItems, patchItems, quickStatus, removeItems, setCascade, unlinkItems } from "@/app/admin/timeline-client-actions";
import type { Attachment, Comment } from "@/lib/assets/service";
import { addDays, diffDays, fmtDate, fmtRange } from "@/lib/schedule/dates";
import type { DateMove, Schedule, VersionRow } from "@/lib/schedule/service";
import { computeMoves, wouldCycle, type Target } from "@/lib/schedule/shift";
import { PHASE_COLORS, STATUSES, statusLabel } from "@/lib/schedule/templates";
import { calOf, endAfter, isOff, snap, workDays } from "@/lib/schedule/workdays";
import { Drawer } from "../ui/controls";
import { Icon } from "../ui/icons";
import { useToast } from "../ui/toast";
import CalendarView from "./CalendarView";
import { AgendaList, ItemPanel, ManagePanel, NewItemPanel } from "./ItemPanel";
import { durationLabel, phaseIndex, isLate, progressOf, signed, slip, type Item, type Mode } from "./shared";
import VerticalGantt from "./VerticalGantt";

const ROW = 36;
const HEAD = 48;
const LEFT = 344;
const ZOOMS = [
  { id: "week", label: "Minggu", px: 34 },
  { id: "month", label: "Bulan", px: 16 },
  { id: "quarter", label: "Kuartal", px: 6 },
] as const;
type View = "gantt" | "vertical" | "calendar";

type DragKind = "move" | "start" | "due";
type Drag = { id: string; kind: DragKind; x0: number; delta: number };
type Panel = { kind: "item"; id: string } | { kind: "new"; trackId: string; parentId: string | null; date: string } | { kind: "manage" };
type Step = { back: DateMove[]; fwd: DateMove[] };
type Optimistic =
  | { type: "dates"; moves: DateMove[] }
  | { type: "patch"; ids: string[]; status?: Item["status"]; color?: number | null }
  | { type: "remove"; ids: string[] };

type Props = {
  schedule: Schedule; mode: Mode; slug: string; today: string; contacts: { id: string; label: string }[];
  attachments: Attachment[]; comments?: Comment[]; me?: { id: string; role: string }; versions?: VersionRow[];
};

const typing = (e: KeyboardEvent) => e.target instanceof HTMLElement && (e.target.isContentEditable || ["INPUT", "TEXTAREA", "SELECT"].includes(e.target.tagName));

export function TimelineBoard({ schedule, mode, slug, today, contacts, attachments, comments = [], me, versions = [] }: Props) {
  const toast = useToast();
  const editable = mode === "edit";
  const [, startTransition] = useTransition();
  const [tracks, optimistic] = useOptimistic(schedule.tracks, (cur, a: Optimistic) =>
    cur.map((t) => ({
      ...t,
      items: t.items.flatMap((i) => {
        if (a.type === "remove") return a.ids.includes(i.id) || (i.parentId && a.ids.includes(i.parentId)) ? [] : [i];
        if (a.type === "patch") return a.ids.includes(i.id) ? [{ ...i, ...(a.status ? { status: a.status } : {}), ...(a.color !== undefined ? { color: a.color } : {}) }] : [i];
        const m = a.moves.find((x) => x.id === i.id);
        return m ? [{ ...i, startDate: m.startDate, dueDate: m.dueDate }] : [i];
      }),
    })),
  );
  const deps = schedule.deps;
  const cal = useMemo(() => calOf(schedule.settings), [schedule.settings]);

  const [view, setView] = useState<View>("gantt");
  const [zoom, setZoom] = useState<(typeof ZOOMS)[number]["id"]>("month");
  const pickView = (v: string) => {
    const z = ZOOMS.find((o) => o.id === v);
    if (z) { setView("gantt"); setZoom(z.id); } else setView(v as View);
    localStorage.setItem("ps.timeline.view", v);
  };
  useEffect(() => {
    const v = localStorage.getItem("ps.timeline.view");
    // eslint-disable-next-line react-hooks/set-state-in-effect -- localStorage is only readable after mount (hydration)
    if (v === "vertical" || v === "calendar" || ZOOMS.some((z) => z.id === v)) pickView(v!);
  }, []);
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set());
  const [fStatus, setFStatus] = useState("");
  const [fPic, setFPic] = useState("");
  const [fLate, setFLate] = useState(false);
  const [fHard, setFHard] = useState(false);
  const [panel, setPanel] = useState<Panel | null>(null);
  const [drag, setDrag] = useState<Drag | null>(null);
  const [sel, setSel] = useState<Set<string>>(new Set());
  const [history, setHistory] = useState<{ undo: Step[]; redo: Step[] }>({ undo: [], redo: [] });
  const [cascade, setCascadeState] = useState(Boolean(schedule.settings.cascade));
  const [link, setLink] = useState<{ from: string; x: number; y: number } | null>(null);
  const scroller = useRef<HTMLDivElement>(null);
  const canvas = useRef<HTMLDivElement>(null);

  const px = ZOOMS.find((z) => z.id === zoom)!.px;
  const allItems = useMemo(() => tracks.flatMap((t) => t.items.map((i) => ({ ...i, trackName: t.name }))), [tracks]);
  const byId = useMemo(() => new Map(allItems.map((i) => [i.id, i])), [allItems]);
  const ph = useMemo(() => phaseIndex(tracks), [tracks]);
  const kids = useMemo(() => {
    const m = new Map<string, Item[]>();
    for (const i of allItems) if (i.parentId) m.set(i.parentId, [...(m.get(i.parentId) ?? []), i]);
    return m;
  }, [allItems]);
  const progress = (id: string) => { const i = byId.get(id); return i ? progressOf(i, kids.get(id) ?? [], today) : 0; };

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

  // ---------- proposing dates ----------

  /** Where an item lands when dragged by `delta` days: on working days, keeping its working-day length when moved. */
  function propose(item: Item, kind: DragKind, delta: number): Target {
    const dir = delta < 0 ? -1 : 1;
    if (item.parentId) {
      const d = snap(cal, addDays(item.startDate, delta), dir);
      return { id: item.id, startDate: d, dueDate: d };
    }
    if (kind === "start") {
      const s = snap(cal, addDays(item.startDate, delta), 1);
      return { id: item.id, startDate: s > item.dueDate ? item.dueDate : s, dueDate: item.dueDate };
    }
    if (kind === "due") {
      const d = snap(cal, addDays(item.dueDate, delta), -1);
      return { id: item.id, startDate: item.startDate, dueDate: d < item.startDate ? item.startDate : d };
    }
    const s = snap(cal, addDays(item.startDate, delta), dir);
    return { id: item.id, startDate: s, dueDate: endAfter(cal, s, Math.max(1, workDays(cal, item.startDate, item.dueDate))) };
  }

  /** The dragged item, or the whole selection when the dragged item is part of it. Milestones ride with a selected phase. */
  function targetsFor(id: string, kind: DragKind, delta: number): Target[] {
    const ids = kind === "move" && sel.has(id) && sel.size > 1 ? [...sel] : [id];
    return ids.flatMap((i) => { const it = byId.get(i); return it && !(it.parentId && ids.includes(it.parentId)) ? [propose(it, kind, delta)] : []; });
  }

  const preview = useMemo(() => {
    if (!drag?.delta) return null;
    try { return computeMoves(allItems, deps, targetsFor(drag.id, drag.kind, drag.delta), cascade, cal); } catch { return null; }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- targetsFor reads only what is listed here
  }, [drag, allItems, deps, cascade, cal, sel]);
  const moved = new Map(preview?.moves.map((m) => [m.id, m]));
  const at = (i: Item) => { const m = moved.get(i.id); return m ? { start: m.newStart, due: m.newDue } : { start: i.startDate, due: i.dueDate }; };

  const matches = (i: Item) => (!fStatus || i.status === fStatus) && (!fPic || i.picContactId === fPic) && (!fLate || isLate(i, today)) && (!fHard || i.hardDeadline);
  const filtering = Boolean(fStatus || fPic || fLate || fHard);
  const shown = tracks.map((t) => ({ ...t, items: t.items.filter(matches) }));
  const rows: ({ type: "track"; track: (typeof tracks)[number] } | { type: "item"; item: Item })[] = [];
  for (const t of shown) {
    rows.push({ type: "track", track: t });
    if (!collapsed.has(t.id)) for (const i of t.items) if (!(i.parentId && collapsed.has(i.parentId))) rows.push({ type: "item", item: i });
  }
  const rowOf = new Map(rows.flatMap((r, n) => (r.type === "item" ? [[r.item.id, n] as const] : [])));
  const phasesWithKids = allItems.filter((i) => kids.has(i.id)).map((i) => i.id);
  const allFolded = phasesWithKids.length > 0 && phasesWithKids.every((id) => collapsed.has(id));
  const toggle = (id: string) => setCollapsed((c) => { const s = new Set(c); if (!s.delete(id)) s.add(id); return s; });

  // Open on today, or on the first item when the schedule has not started yet.
  const firstStart = allItems.map((i) => i.startDate).sort()[0];
  const focus = firstStart && firstStart > today ? firstStart : today;
  useEffect(() => {
    const el = scroller.current;
    if (el) el.scrollLeft = Math.max(0, diffDays(min, focus) * px - 160);
  }, [min, focus, px, view]);

  // ---------- actions ----------

  function save(step: Step, moves: DateMove[], summary: string, then: (h: typeof history) => typeof history, done?: string) {
    startTransition(async () => {
      optimistic({ type: "dates", moves });
      const r = await moveItems(slug, moves, summary);
      if (!r.ok) return toast({ message: r.error, tone: "error" });
      setHistory(then);
      if (done) toast({ message: done });
    });
  }

  function apply(result: ReturnType<typeof computeMoves>, subject: string) {
    if (!result.moves.length) return;
    const step: Step = {
      back: result.moves.map((m) => ({ id: m.id, startDate: m.oldStart, dueDate: m.oldDue })),
      fwd: result.moves.map((m) => ({ id: m.id, startDate: m.newStart, dueDate: m.newDue })),
    };
    const n = result.conflicts.length;
    save(step, step.fwd, `Mengubah jadwal ${subject}`, (h) => ({ undo: [...h.undo, step].slice(-50), redo: [] }), n ? `${n} bentrok dengan item yang menunggu. Panah merah menunjukkan letaknya.` : undefined);
  }

  const undo = () => { const s = history.undo.at(-1); if (s) save(s, s.back, "Mengurungkan perubahan jadwal", (h) => ({ undo: h.undo.slice(0, -1), redo: [...h.redo, s] })); };
  const redo = () => { const s = history.redo.at(-1); if (s) save(s, s.fwd, "Mengulang perubahan jadwal", (h) => ({ undo: [...h.undo, s], redo: h.redo.slice(0, -1) })); };

  function nudge(item: Item, days: number) {
    const targets = targetsFor(item.id, "move", days);
    apply(computeMoves(allItems, deps, targets, cascade, cal), targets.length > 1 ? `${targets.length} item` : `"${item.name}"`);
  }

  function setStatus(ids: string[], status: string) {
    startTransition(async () => {
      optimistic({ type: "patch", ids, status: status as Item["status"] });
      const r = ids.length === 1 ? await quickStatus(slug, ids[0], status) : await patchItems(slug, ids, { status });
      if (!r.ok) toast({ message: r.error, tone: "error" });
    });
  }

  function setColor(ids: string[], c: number | null) {
    startTransition(async () => {
      optimistic({ type: "patch", ids, color: c });
      const r = await patchItems(slug, ids, { color: c });
      if (!r.ok) toast({ message: r.error, tone: "error" });
    });
  }

  function removeSelected() {
    const ids = [...sel];
    if (!ids.length || !window.confirm(`Hapus ${ids.length} item terpilih beserta milestone di dalamnya?`)) return;
    setSel(new Set());
    setPanel(null);
    startTransition(async () => {
      optimistic({ type: "remove", ids });
      const r = await removeItems(slug, ids);
      toast(r.ok ? { message: `${ids.length} item dihapus.` } : { message: r.error, tone: "error" });
    });
  }

  function toggleCascade(v: boolean) {
    setCascadeState(v);
    startTransition(async () => { const r = await setCascade(slug, v); if (!r.ok) toast({ message: r.error, tone: "error" }); });
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

  /** Plain click: select just this and open it. With Shift/Cmd/Ctrl: add to or remove from the selection. */
  function pick(id: string, e: { shiftKey: boolean; metaKey: boolean; ctrlKey: boolean }) {
    if (e.shiftKey || e.metaKey || e.ctrlKey) return setSel((s) => { const n = new Set(s); if (!n.delete(id)) n.add(id); return n; });
    setSel(new Set([id]));
    setPanel({ kind: "item", id });
  }

  // Re-subscribed every render so the handler always sees the current history and selection.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") { setDrag(null); setLink(null); if (!panel) setSel(new Set()); return; }
      if (!editable || typing(e)) return;
      const z = e.key.toLowerCase() === "z" && (e.metaKey || e.ctrlKey);
      if (z && e.shiftKey || (e.key.toLowerCase() === "y" && e.ctrlKey)) { e.preventDefault(); redo(); }
      else if (z) { e.preventDefault(); undo(); }
      else if ((e.key === "Delete" || e.key === "Backspace") && sel.size > 0 && !panel) { e.preventDefault(); removeSelected(); }
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  });

  // ---------- pointer handling ----------

  function dragHandlers(item: Item, kind: DragKind) {
    if (!editable) return { onClick: (e: React.MouseEvent) => pick(item.id, e) };
    return {
      onPointerDown: (e: React.PointerEvent) => {
        if (e.button !== 0) return;
        e.stopPropagation();
        e.currentTarget.setPointerCapture(e.pointerId);
        setDrag({ id: item.id, kind, x0: e.clientX, delta: 0 });
      },
      onPointerMove: (e: React.PointerEvent) => {
        e.stopPropagation();
        setDrag((d) => (d && d.id === item.id ? { ...d, delta: Math.round((e.clientX - d.x0) / px) } : d));
      },
      onPointerUp: (e: React.PointerEvent) => {
        e.stopPropagation();
        if (!drag || drag.id !== item.id) return;
        if (drag.delta === 0) pick(item.id, e);
        else if (preview) apply(preview, preview.moves.length > 1 ? `"${item.name}" dan ${preview.moves.length - 1} item lain` : `"${item.name}"`);
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

  const dateAt = (e: React.MouseEvent) => addDays(min, Math.floor((e.clientX - e.currentTarget.getBoundingClientRect().left) / px));

  // ---------- header ticks ----------

  const months: { key: string; label: string; left: number }[] = [];
  for (let d = `${min.slice(0, 7)}-01`; d <= max; ) {
    const [y, m] = d.split("-").map(Number);
    const next = m === 12 ? `${y + 1}-01-01` : `${y}-${String(m + 1).padStart(2, "0")}-01`;
    // A month that began before the visible range is labelled only if enough of it is showing.
    if (x(d) >= 0 || x(next) > 120) months.push({ key: d, label: new Intl.DateTimeFormat("id-ID", { month: zoom === "quarter" ? "short" : "long", year: "numeric", timeZone: "UTC" }).format(Date.parse(`${d}T00:00:00Z`)), left: Math.max(0, x(d)) });
    d = next;
  }
  const days = Array.from({ length: total }, (_, n) => addDays(min, n)).map((d) => ({ d, dow: new Date(`${d}T00:00:00Z`).getUTCDay() }));
  const firstMonday = days.find(({ dow }) => dow === 1)?.d ?? min;
  // Thin line per day (per week when zoomed out), a firmer one every Monday.
  const weekLine = `linear-gradient(to right, var(--line) 1px, transparent 1px)`;
  const grid = zoom === "quarter"
    ? { backgroundImage: weekLine, backgroundSize: `${px * 7}px 100%`, backgroundPosition: `${x(firstMonday)}px 0` }
    : { backgroundImage: `${weekLine}, linear-gradient(to right, var(--grid) 1px, transparent 1px)`, backgroundSize: `${px * 7}px 100%, ${px}px 100%`, backgroundPosition: `${x(firstMonday)}px 0, 0 0` };

  const linkCount = new Map<string, number>();
  for (const a of attachments) if (a.targetType === "schedule_item") linkCount.set(a.targetId, (linkCount.get(a.targetId) ?? 0) + 1);
  const panelItem = panel?.kind === "item" ? byId.get(panel.id) : undefined;
  const panelTrack = panelItem ? tracks.find((t) => t.id === panelItem.trackId) : undefined;
  const others = preview && drag ? preview.moves.filter((m) => m.id !== drag.id).length : 0;
  const conflictIds = new Set(preview?.conflictIds);
  const bodyHeight = rows.length * ROW;
  const openItem = (id: string) => { setSel(new Set([id])); setPanel({ kind: "item", id }); };

  return (
    <div className="space-y-3">
      {/* toolbar */}
      <div className="flex flex-wrap items-center gap-x-2 gap-y-2">
        <select aria-label="Tampilan" className="!w-auto hidden md:block" value={view === "gantt" ? zoom : view} onChange={(e) => pickView(e.target.value)}>
          <optgroup label="Gantt">
            {ZOOMS.map((z) => <option key={z.id} value={z.id}>Gantt · {z.label}</option>)}
          </optgroup>
          <option value="vertical">Gantt vertikal</option>
          <option value="calendar">Kalender</option>
        </select>
        {view === "gantt" && (
          <>
            <button type="button" className="btn-ghost hidden md:inline-flex" onClick={() => scroller.current?.scrollTo({ left: Math.max(0, x(today) - 160), behavior: "smooth" })}>Hari ini</button>
            {phasesWithKids.length > 0 && (
              <button type="button" className="btn-ghost hidden md:inline-flex" onClick={() => setCollapsed((c) => { const s = new Set(c); for (const id of phasesWithKids) if (allFolded) s.delete(id); else s.add(id); return s; })}>
                {allFolded ? "Buka milestone" : "Ciutkan milestone"}
              </button>
            )}
          </>
        )}
        {editable && (
          <div className="hidden items-center md:flex">
            <button type="button" className="btn-ghost !px-1.5" aria-label="Urungkan" title="Urungkan (Cmd/Ctrl+Z)" disabled={!history.undo.length} onClick={undo}><Icon name="undo" /></button>
            <button type="button" className="btn-ghost !px-1.5" aria-label="Ulangi" title="Ulangi (Shift+Cmd/Ctrl+Z)" disabled={!history.redo.length} onClick={redo}><Icon name="redo" /></button>
          </div>
        )}
        <div className="ml-auto flex flex-wrap items-center gap-2">
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
          {editable && (
            <>
              <label className="check" title="Saat sebuah item digeser, item yang menunggunya ikut bergeser. Jika mati, hanya item itu yang pindah dan bentrokan ditandai merah.">
                <input type="checkbox" checked={cascade} onChange={(e) => toggleCascade(e.target.checked)} /> Geser yang bergantung
              </label>
              {tracks.length > 0 && <button type="button" className="btn-secondary" onClick={() => setPanel({ kind: "new", trackId: tracks[0].id, parentId: null, date: today })}><Icon name="plus" /> Item</button>}
              <button type="button" className="btn" onClick={() => setPanel({ kind: "manage" })}>Kelola</button>
            </>
          )}
        </div>
      </div>

      {tracks.length === 0 ? (
        <div className="empty">
          <p className="font-medium">Belum ada jadwal.</p>
          <p className="muted mt-1">{editable ? "Mulai dengan menambah track dari template, misalnya Production atau Main Feature. Fase dan milestone-nya langsung tersedia." : "Jadwal belum dibuat."}</p>
          {editable && <button type="button" className="btn mt-3" onClick={() => setPanel({ kind: "manage" })}><Icon name="plus" /> Tambah track</button>}
        </div>
      ) : (
        <>
          {/* narrow screens: agenda */}
          <div className="md:hidden"><AgendaList tracks={shown} today={today} onOpen={openItem} ph={ph} /></div>

          {view === "calendar" && <div className="hidden md:block"><CalendarView tracks={shown} cal={cal} ph={ph} progress={progress} today={today} onOpen={openItem} /></div>}
          {view === "vertical" && <div className="hidden md:block"><VerticalGantt tracks={shown} cal={cal} ph={ph} progress={progress} today={today} onOpen={openItem} /></div>}

          {view === "gantt" && (
            <div ref={scroller} className="tl hidden max-h-[74vh] overflow-auto md:block" style={{ "--row": `${ROW}px` } as React.CSSProperties} data-testid="timeline-board">
              <div className="relative" style={{ width: LEFT + width }}>
                <div className="tl-head sticky top-0 z-30 flex" style={{ height: HEAD }}>
                  <div className="sticky left-0 z-10 flex shrink-0 items-end bg-bg px-3 pb-2 text-xs text-ink-2" style={{ width: LEFT }}>
                    {filtering ? `${rowOf.size} dari ${allItems.length} item` : `${allItems.length} item`}
                  </div>
                  <div className="relative" style={{ width }}>
                    {months.map((m) => <div key={m.key} className="tl-month" style={{ left: m.left }}>{m.label}</div>)}
                    {zoom !== "quarter" && days.filter(({ dow }) => zoom === "week" || dow === 1).map(({ d }) => (
                      <div key={d} className="tl-daynum" data-weekend={isOff(cal, d) || undefined} style={{ left: x(d), width: zoom === "week" ? px : px * 2 }}>{d === today ? "" : Number(d.slice(8))}</div>
                    ))}
                    <div className="tl-today-label" style={{ left: x(today) + px / 2 }}>{Number(today.slice(8))}</div>
                  </div>
                </div>

                <div ref={canvas} className="relative" style={{ height: bodyHeight }}>
                  {/* backdrop: day lines, days off, month lines, today */}
                  <div className="pointer-events-none absolute inset-y-0" style={{ left: LEFT, width, ...grid }}>
                    {days.filter(({ d }) => isOff(cal, d)).map(({ d }) => <div key={d} className="tl-holiday" style={{ left: x(d), width: px }} />)}
                    {months.map((m) => <div key={m.key} className="tl-month-line" style={{ left: m.left }} />)}
                    <div className="tl-today" style={{ left: x(today) + px / 2 }} />
                  </div>

                  {rows.map((r, n) =>
                    r.type === "track" ? (
                      <div key={r.track.id} data-track className="tl-row flex" style={{ top: n * ROW }}>
                        <div className="track-band sticky left-0 z-20 flex shrink-0 items-center gap-1 px-2" style={{ width: LEFT }}>
                          <button type="button" aria-expanded={!collapsed.has(r.track.id)} className="flex min-w-0 flex-1 cursor-pointer items-center gap-1.5 text-left" onClick={() => toggle(r.track.id)}>
                            <Icon name="chevron" className={`muted transition-transform duration-150 ${collapsed.has(r.track.id) ? "" : "rotate-90"}`} />
                            <span className="truncate">{r.track.name}</span>
                            <span className="muted font-sans text-xs font-semibold tabular-nums">{r.track.items.filter((i) => !i.parentId).length} fase</span>
                          </button>
                          {editable && <button type="button" className="btn-ghost !min-h-6 !px-1.5 text-xs" onClick={() => setPanel({ kind: "new", trackId: r.track.id, parentId: null, date: today })}><Icon name="plus" /> Fase</button>}
                        </div>
                        <div
                          className="flex-1"
                          title={editable ? "Klik dua kali untuk menambah fase di tanggal ini" : undefined}
                          onDoubleClick={editable ? (e) => setPanel({ kind: "new", trackId: r.track.id, parentId: null, date: dateAt(e) }) : undefined}
                        />
                      </div>
                    ) : (
                      renderRow(r.item, n * ROW)
                    ),
                  )}

                  {/* dependency arrows */}
                  <svg className="pointer-events-none absolute top-0 z-10" style={{ left: LEFT, width, height: bodyHeight }} aria-hidden>
                    <defs>
                      <marker id="arrow" viewBox="0 0 8 8" refX="7" refY="4" markerWidth="6" markerHeight="6" orient="auto"><path d="M0,0 L8,4 L0,8 z" fill="context-stroke" /></marker>
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
                        <g key={`${d.itemId}-${d.dependsOnId}`}>
                          <path className="dep" data-bad={bad || undefined} d={path} markerEnd="url(#arrow)" />
                          {editable && (
                            <path d={path} fill="none" stroke="transparent" strokeWidth={10} className="cursor-pointer" style={{ pointerEvents: "stroke" }} onClick={() => { if (window.confirm(`Lepas dependency: "${b.name}" menunggu "${a.name}"?`)) removeLink(d.itemId, d.dependsOnId); }}>
                              <title>{`"${b.name}" menunggu "${a.name}"${bad ? " (bentrok)" : ""}. Klik untuk melepas.`}</title>
                            </path>
                          )}
                        </g>
                      );
                    })}
                    {link && byId.get(link.from) && rowOf.has(link.from) && (
                      <line className="dep-draft" x1={x(byId.get(link.from)!.dueDate) + px} y1={rowOf.get(link.from)! * ROW + ROW / 2} x2={link.x - LEFT} y2={link.y} />
                    )}
                  </svg>
                </div>
              </div>
            </div>
          )}

          {view === "gantt" && editable && (
            <p className="hidden text-[13px] text-ink-2 md:block">
              Seret batang untuk memindah, ujungnya untuk memperpanjang, titik di kanannya ke item lain untuk membuat dependency. Shift-klik memilih beberapa item. Klik dua kali di baris fase untuk menambah milestone.
            </p>
          )}
        </>
      )}

      {/* actions on a multi-selection */}
      {sel.size > 1 && mode !== "view" && (
        <div role="toolbar" aria-label="Aksi untuk item terpilih" className="sheet-bar fixed inset-x-0 bottom-5 z-50 mx-auto flex w-fit max-w-[calc(100%-2rem)] flex-wrap items-center gap-3 px-3 py-2 text-sm">
          <span className="font-medium tabular-nums">{sel.size} dipilih</span>
          <select aria-label="Ubah status item terpilih" className="!w-auto" value="" onChange={(e) => e.target.value && setStatus([...sel], e.target.value)}>
            <option value="">Ubah status…</option>
            {STATUSES.map((s) => <option key={s.value} value={s.value}>{s.label}</option>)}
          </select>
          {editable && (
            <>
              <span className="flex items-center gap-1" role="group" aria-label="Warna">
                {Array.from({ length: PHASE_COLORS }, (_, n) => n + 1).map((c) => (
                  <button key={c} type="button" aria-label={`Warna ${c}`} className="swatch" data-ph={c} style={{ background: "var(--c)" }} onClick={() => setColor([...sel], c)} />
                ))}
              </span>
              <button type="button" className="btn-danger" onClick={removeSelected}>Hapus</button>
            </>
          )}
          <button type="button" className="btn-ghost" onClick={() => setSel(new Set())}>Batal</button>
        </div>
      )}

      {panel?.kind === "item" && panelItem && panelTrack && (
        <Drawer ph={ph(panelItem.id)} title={panelItem.name} onClose={() => setPanel(null)}>
          <ItemPanel item={panelItem} track={panelTrack} mode={mode} slug={slug} today={today} allItems={allItems} deps={deps} contacts={contacts} onLink={addLink} onUnlink={removeLink}
            cal={cal} cascade={cascade} ph={ph(panelItem.id)} onAddMilestone={() => setPanel({ kind: "new", trackId: panelItem.trackId, parentId: panelItem.id, date: panelItem.dueDate })}
            attachments={attachments.filter((a) => a.targetType === "schedule_item" && a.targetId === panelItem.id)}
            comments={comments.filter((c) => c.targetType === "schedule_item" && c.targetId === panelItem.id)} me={me} />
        </Drawer>
      )}
      {panel?.kind === "new" && (
        <Drawer title="Item baru" onClose={() => setPanel(null)}>
          <NewItemPanel key={`${panel.trackId}:${panel.parentId}:${panel.date}`} slug={slug} tracks={tracks} trackId={panel.trackId} parentId={panel.parentId} date={panel.date} cal={cal} />
        </Drawer>
      )}
      {panel?.kind === "manage" && (
        <Drawer title="Kelola timeline" onClose={() => setPanel(null)}>
          <ManagePanel slug={slug} tracks={tracks} today={today} hasItems={allItems.length > 0} settings={schedule.settings} versions={versions} years={[...new Set([min, max, today].map((d) => Number(d.slice(0, 4))))].sort()} />
        </Drawer>
      )}
    </div>
  );

  // Plain functions, not components: bars must keep their DOM node across renders for pointer capture.
  function marker(item: Item) {
    const p = at(item);
    const late = isLate(item, today);
    return (
      <div
        key={item.id}
        data-item-id={item.id}
        role="button"
        tabIndex={0}
        aria-label={`${item.name}, ${fmtDate(p.start)}, ${statusLabel(item.status)}`}
        aria-pressed={sel.has(item.id)}
        title={`${item.name} · ${fmtDate(p.start)} · ${statusLabel(item.status)}`}
        data-ph={ph(item.id)}
        data-status={item.status}
        data-selected={sel.has(item.id) || undefined}
        data-late={late || undefined}
        className={`milestone ${editable ? "cursor-grab touch-none active:cursor-grabbing" : "cursor-pointer"}`}
        style={{ left: x(p.start) + px / 2 - 6 }}
        onKeyDown={(e) => keys(e, item)}
        {...dragHandlers(item, "move")}
      />
    );
  }

  function keys(e: React.KeyboardEvent, item: Item) {
    if (e.key === "Enter" || e.key === " ") { e.preventDefault(); pick(item.id, e); }
    else if (editable && e.key === "ArrowRight") { e.preventDefault(); nudge(item, 1); }
    else if (editable && e.key === "ArrowLeft") { e.preventDefault(); nudge(item, -1); }
  }

  function renderRow(item: Item, top: number) {
    const p = at(item);
    const m = moved.get(item.id);
    const isSubject = drag?.id === item.id && Boolean(drag.delta);
    const late = isLate(item, today);
    const left = x(p.start);
    const w = Math.max((diffDays(p.start, p.due) + 1) * px, 6);
    const milestone = Boolean(item.parentId);
    const children = kids.get(item.id) ?? [];
    const folded = collapsed.has(item.id);
    const selected = sel.has(item.id);
    return (
      <div key={item.id} data-ph={ph(item.id)} data-conflict={conflictIds.has(item.id) || undefined} className="tl-row flex" style={{ top }}>
        <div className={`tl-label sticky left-0 z-20 flex shrink-0 items-center gap-2 px-2 ${milestone ? "pl-9" : ""}`} data-selected={selected || undefined} style={{ width: LEFT }}>
          {!milestone && (children.length > 0
            ? <button type="button" aria-expanded={!folded} aria-label={`${folded ? "Buka" : "Ciutkan"} milestone ${item.name}`} className="cursor-pointer text-muted hover:text-ink" onClick={() => toggle(item.id)}><Icon name="chevron" className={`transition-transform duration-150 ${folded ? "" : "rotate-90"}`} /></button>
            : <span className="w-4 shrink-0" />)}
          <span aria-hidden className={milestone ? "diamond" : "ph-mark"} />
          <button type="button" className={`min-w-0 flex-1 cursor-pointer truncate text-left hover:underline ${milestone ? "text-[13px] text-ink-2" : "text-[13px] font-medium"}`} onClick={(e) => pick(item.id, e)}>
            {item.name}
            {!milestone && folded && <span className="ml-1.5 text-xs font-normal text-muted tabular-nums">{children.length}</span>}
            {item.hardDeadline && <span className="ml-1.5 text-xs font-medium text-danger" title="Hard deadline: tidak ikut bergeser">hard</span>}
          </button>
          {linkCount.get(item.id) && <span className="flex shrink-0 items-center gap-0.5 text-xs text-muted tabular-nums" title={`${linkCount.get(item.id)} link`}><Icon name="link" className="size-3.5" />{linkCount.get(item.id)}</span>}
          <span className={`shrink-0 text-right text-xs tabular-nums ${late ? "font-medium text-danger" : "text-muted"}`} title={milestone ? (late ? "Terlambat" : undefined) : `${fmtRange(p.start, p.due)} · ${durationLabel(cal, p.start, p.due)}${late ? " · terlambat" : ""}`}>
            {fmtDate(p.due).replace(/ \d{4}$/, "")}
            {!milestone && <span className="ml-1.5 inline-block w-9 text-muted">{workDays(cal, p.start, p.due)} hk</span>}
            {slip(item) && <span className="ml-1 text-warn">{slip(item)}</span>}
          </span>
          {mode === "view" ? (
            <span className="w-[5.5rem] shrink-0 text-xs text-muted">{statusLabel(item.status)}</span>
          ) : (
            <select aria-label={`Status ${item.name}`} className="status-select" data-status={item.status} value={item.status} onChange={(e) => setStatus([item.id], e.target.value)}>
              {STATUSES.map((s) => <option key={s.value} value={s.value}>{s.label}</option>)}
            </select>
          )}
        </div>
        <div
          className="relative flex-1"
          title={editable && !milestone ? "Klik dua kali untuk menambah milestone di tanggal ini" : undefined}
          onDoubleClick={editable && !milestone ? (e) => setPanel({ kind: "new", trackId: item.trackId, parentId: item.id, date: dateAt(e) }) : undefined}
        >
          {milestone ? marker(item) : (
            <>
              {/* baseline, and where the bar was before the change being dragged */}
              {(item.baselineStart !== item.startDate || item.baselineDue !== item.dueDate) && (
                <div className="bar-baseline" style={{ left: x(item.baselineStart), width: (diffDays(item.baselineStart, item.baselineDue) + 1) * px }} />
              )}
              {m && <div className="bar-ghost" style={{ left: x(m.oldStart), width: (diffDays(m.oldStart, m.oldDue) + 1) * px }} />}
              <div
                data-item-id={item.id}
                role="button"
                tabIndex={0}
                aria-pressed={selected}
                aria-label={`${item.name}, ${fmtRange(p.start, p.due)}, ${statusLabel(item.status)}`}
                title={`${item.name} · ${fmtRange(p.start, p.due)} · ${durationLabel(cal, p.start, p.due)} · ${statusLabel(item.status)}${item.picName ? ` · PIC ${item.picName}` : ""}`}
                data-ph={ph(item.id)}
                data-status={item.status}
                data-selected={selected || undefined}
                data-late={late || undefined}
                data-conflict={conflictIds.has(item.id) || undefined}
                data-dragging={isSubject || undefined}
                data-preview={(m && !isSubject) || undefined}
                className={`bar ${editable ? "cursor-grab active:cursor-grabbing" : "cursor-pointer"}`}
                style={{ left, width: w, "--p": progress(item.id) } as React.CSSProperties}
                onKeyDown={(e) => keys(e, item)}
                {...dragHandlers(item, "move")}
              >
                {w >= 64 && <span className="truncate">{item.name}</span>}
                {editable && w >= 24 && (
                  <>
                    <span aria-hidden className="bar-handle" data-edge="start" {...dragHandlers(item, "start")} />
                    <span aria-hidden className="bar-handle" data-edge="due" {...dragHandlers(item, "due")} />
                  </>
                )}
              </div>
              {item.hardDeadline && <span aria-hidden className="bar-wall" style={{ left: left + w - 1 }} />}
              {folded && children.filter(matches).map(marker)}
              {editable && (
                <span aria-hidden title="Seret ke item lain untuk membuat dependency" data-link-handle={item.id} className="bar-link touch-none" style={{ left: left + w + 6, top: (ROW - 9) / 2 }} {...linkHandlers(item)} />
              )}
            </>
          )}
          {isSubject && drag && preview && (
            <div className="tl-tip" style={{ top: 6, left: (milestone ? left + px : left + w) + 20 }}>
              {fmtRange(p.start, p.due)}{!milestone && ` · ${workDays(cal, p.start, p.due)} hk`} · {signed(diffDays(item.startDate, p.start) || diffDays(item.dueDate, p.due))}{others > 0 && ` · ${others} item ikut`}{preview.conflicts.length > 0 && ` · ${preview.conflicts.length} bentrok`}
            </div>
          )}
        </div>
      </div>
    );
  }
}
