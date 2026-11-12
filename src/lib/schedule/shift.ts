// Pure schedule-shift logic: given date changes on some items, work out what
// else moves and what collides, so the UI can show it before anything is saved.
import { addDays, diffDays, fmtDate } from "./dates";
import { moveKeepingLength, NO_CAL, snap, type Cal } from "./workdays";

export type SItem = { id: string; name: string; parentId: string | null; startDate: string; dueDate: string; hardDeadline: boolean };
export type Dep = { itemId: string; dependsOnId: string };
export type Move = { id: string; name: string; oldStart: string; oldDue: string; newStart: string; newDue: string };
export type ShiftResult = { moves: Move[]; conflicts: string[]; conflictIds: string[] };
export type Target = { id: string; startDate: string; dueDate: string };

/**
 * Milestones always travel with their phase when the whole phase moves (not when it is resized).
 * cascade = true: everything that (transitively) depends on a target also moves by the number
 * of days the target's due date moved. Hard-deadline items never move automatically.
 * Whatever a moved item now collides with is reported as a conflict.
 */
export function computeMoves(items: SItem[], deps: Dep[], targets: Target[], cascade: boolean, cal: Cal = NO_CAL): ShiftResult {
  const byId = new Map(items.map((i) => [i.id, i]));
  const moves = new Map<string, Move>();
  const put = (i: SItem, start: string, due: string) => moves.set(i.id, { id: i.id, name: i.name, oldStart: i.startDate, oldDue: i.dueDate, newStart: start, newDue: due });
  const children = (id: string) => items.filter((i) => i.parentId === id);
  const dependents = (id: string) => deps.filter((d) => d.dependsOnId === id).map((d) => byId.get(d.itemId)!).filter(Boolean);
  const targetIds = new Set(targets.map((t) => t.id));

  const queue: [SItem, number][] = [];
  const follow = (item: SItem, startDelta: number, dueDelta: number) => {
    if (startDelta && startDelta === dueDelta) for (const c of children(item.id)) queue.push([c, startDelta]);
    if (cascade && dueDelta) for (const d of dependents(item.id)) queue.push([d, dueDelta]);
  };

  for (const t of targets) {
    const item = byId.get(t.id);
    if (!item) throw new Error("Item tidak ditemukan.");
    if (t.startDate > t.dueDate) throw new Error("Tanggal mulai tidak boleh setelah due date.");
    const [startDelta, dueDelta] = [diffDays(item.startDate, t.startDate), diffDays(item.dueDate, t.dueDate)];
    if (!startDelta && !dueDelta) continue;
    put(item, t.startDate, t.dueDate);
    follow(item, startDelta, dueDelta);
  }
  while (queue.length) {
    const [item, delta] = queue.shift()!;
    if (moves.has(item.id) || targetIds.has(item.id) || item.hardDeadline) continue;
    const [start, due] = item.parentId
      ? [snap(cal, addDays(item.startDate, delta)), snap(cal, addDays(item.dueDate, delta))]
      : moveKeepingLength(cal, item.startDate, item.dueDate, addDays(item.startDate, delta));
    put(item, start, due);
    const moved = diffDays(item.startDate, start);
    follow(item, moved, moved);
  }

  // A moved predecessor now ends on/after the start of something that stayed put.
  const conflicts: string[] = [];
  const conflictIds: string[] = [];
  for (const d of deps) {
    const pred = moves.get(d.dependsOnId);
    const succ = byId.get(d.itemId);
    if (!pred || !succ || moves.has(succ.id)) continue;
    if (pred.newDue >= succ.startDate) {
      conflictIds.push(succ.id);
      conflicts.push(
        `"${pred.name}" selesai ${fmtDate(pred.newDue)}, menabrak ${succ.hardDeadline ? "hard deadline " : ""}"${succ.name}" (mulai ${fmtDate(succ.startDate)}).`,
      );
    }
  }
  return { moves: [...moves.values()], conflicts, conflictIds };
}

export function computeShift(items: SItem[], deps: Dep[], itemId: string, newStart: string, newDue: string, cascade: boolean, cal: Cal = NO_CAL): ShiftResult {
  return computeMoves(items, deps, [{ id: itemId, startDate: newStart, dueDate: newDue }], cascade, cal);
}

/** True when making itemId depend on dependsOnId would create a loop. */
export function wouldCycle(deps: Dep[], itemId: string, dependsOnId: string): boolean {
  const seen = new Set<string>();
  const stack = [dependsOnId];
  while (stack.length) {
    const id = stack.pop()!;
    if (id === itemId) return true;
    if (seen.has(id)) continue;
    seen.add(id);
    for (const d of deps) if (d.itemId === id) stack.push(d.dependsOnId);
  }
  return false;
}
