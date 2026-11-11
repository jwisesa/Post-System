// Pure schedule-shift logic: given a date change on one item, work out what
// else moves and what collides, so the UI can preview before anything is saved.
import { addDays, diffDays, fmtDate } from "./dates";

export type SItem = { id: string; name: string; parentId: string | null; startDate: string; dueDate: string; hardDeadline: boolean };
export type Dep = { itemId: string; dependsOnId: string };
export type Move = { id: string; name: string; oldStart: string; oldDue: string; newStart: string; newDue: string };
export type ShiftResult = { moves: Move[]; conflicts: string[] };

/**
 * cascade = true: everything that (transitively) depends on the item moves by
 * the same number of days its due date moved; milestones travel with their phase.
 * Hard-deadline items never move automatically; they are reported as conflicts.
 */
export function computeShift(items: SItem[], deps: Dep[], itemId: string, newStart: string, newDue: string, cascade: boolean): ShiftResult {
  const byId = new Map(items.map((i) => [i.id, i]));
  const target = byId.get(itemId);
  if (!target) throw new Error("Item tidak ditemukan.");
  if (newStart > newDue) throw new Error("Tanggal mulai tidak boleh setelah due date.");

  const moves = new Map<string, Move>();
  const put = (i: SItem, start: string, due: string) => moves.set(i.id, { id: i.id, name: i.name, oldStart: i.startDate, oldDue: i.dueDate, newStart: start, newDue: due });
  const children = (id: string) => items.filter((i) => i.parentId === id);
  const dependents = (id: string) => deps.filter((d) => d.dependsOnId === id).map((d) => byId.get(d.itemId)!).filter(Boolean);

  const startDelta = diffDays(target.startDate, newStart);
  const dueDelta = diffDays(target.dueDate, newDue);
  if (startDelta || dueDelta) put(target, newStart, newDue);

  if (cascade) {
    const queue: [SItem, number][] = [];
    if (startDelta) for (const c of children(itemId)) queue.push([c, startDelta]);
    if (dueDelta) for (const d of dependents(itemId)) queue.push([d, dueDelta]);
    while (queue.length) {
      const [item, delta] = queue.shift()!;
      if (moves.has(item.id) || item.hardDeadline) continue;
      put(item, addDays(item.startDate, delta), addDays(item.dueDate, delta));
      for (const c of children(item.id)) queue.push([c, delta]);
      for (const d of dependents(item.id)) queue.push([d, delta]);
    }
  }

  // A moved predecessor now ends on/after the start of something that stayed put.
  const conflicts: string[] = [];
  for (const d of deps) {
    const pred = moves.get(d.dependsOnId);
    const succ = byId.get(d.itemId);
    if (!pred || !succ || moves.has(succ.id)) continue;
    if (pred.newDue >= succ.startDate) {
      conflicts.push(
        `"${pred.name}" selesai ${fmtDate(pred.newDue)}, menabrak ${succ.hardDeadline ? "hard deadline " : ""}"${succ.name}" (mulai ${fmtDate(succ.startDate)}).`,
      );
    }
  }
  return { moves: [...moves.values()], conflicts };
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
