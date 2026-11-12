import { and, asc, eq, inArray, or } from "drizzle-orm";
import type { Db } from "@/db/client";
import { attachments, comments, dependencies, scheduleItems, teamContacts, tracks, type ItemStatus } from "@/db/schema";
import { InputError, record, requireRole, type Tx } from "../services";
import { addDays, fmtRange, isDate } from "./dates";
import { computeShift, wouldCycle, type Dep } from "./shift";
import { STATUSES, TRACK_TEMPLATES } from "./templates";

export type Item = typeof scheduleItems.$inferSelect;

/** Tracks with their items (phases by start date, milestones under their phase) plus dependencies. */
export async function getSchedule(db: Db, projectId: string, opts: { includeInternal: boolean }) {
  const [trackRows, itemRows, contacts] = await Promise.all([
    db.select().from(tracks).where(eq(tracks.projectId, projectId)).orderBy(asc(tracks.sortOrder), asc(tracks.createdAt)),
    db.select().from(scheduleItems).where(eq(scheduleItems.projectId, projectId)).orderBy(asc(scheduleItems.startDate), asc(scheduleItems.createdAt)),
    db.select({ id: teamContacts.id, name: teamContacts.name, internal: teamContacts.internal }).from(teamContacts).where(eq(teamContacts.projectId, projectId)),
  ]);
  const hidden = new Set<string>();
  if (!opts.includeInternal) {
    for (const i of itemRows) if (i.internal) hidden.add(i.id);
    for (const i of itemRows) if (i.parentId && hidden.has(i.parentId)) hidden.add(i.id);
  }
  const items = itemRows.filter((i) => !hidden.has(i.id));
  const ids = new Set(items.map((i) => i.id));
  const deps: Dep[] = items.length
    ? (await db.select().from(dependencies).where(inArray(dependencies.itemId, [...ids]))).filter((d) => ids.has(d.dependsOnId))
    : [];
  const pic = new Map(contacts.filter((c) => opts.includeInternal || !c.internal).map((c) => [c.id, c.name]));
  const withPic = (i: Item) => ({ ...i, picName: i.picContactId ? (pic.get(i.picContactId) ?? null) : null });
  return {
    tracks: trackRows.map((t) => {
      const own = items.filter((i) => i.trackId === t.id);
      const ordered = own.filter((i) => !i.parentId || !ids.has(i.parentId)).flatMap((p) => [p, ...own.filter((c) => c.parentId === p.id)]);
      return { ...t, items: ordered.map(withPic) };
    }),
    deps,
  };
}

export type Schedule = Awaited<ReturnType<typeof getSchedule>>;

async function loadItem(tx: Tx | Db, projectId: string, itemId: string) {
  const [item] = await tx.select().from(scheduleItems).where(and(eq(scheduleItems.id, itemId), eq(scheduleItems.projectId, projectId)));
  if (!item) throw new InputError("Item jadwal tidak ditemukan.");
  return item;
}

function checkDates(start: string, due: string) {
  if (!isDate(start) || !isDate(due)) throw new InputError("Tanggal tidak valid.");
  if (start > due) throw new InputError("Tanggal mulai tidak boleh setelah due date.");
}

/** Links and comments point at items by id without a foreign key, so remove them with the items. */
async function dropItemExtras(tx: Tx, itemIds: string[]) {
  if (!itemIds.length) return;
  await tx.delete(attachments).where(and(eq(attachments.targetType, "schedule_item"), inArray(attachments.targetId, itemIds)));
  await tx.delete(comments).where(and(eq(comments.targetType, "schedule_item"), inArray(comments.targetId, itemIds)));
}

// ---------- tracks ----------

export async function addTrack(db: Db, userId: string, projectId: string, input: { name: string; template: string; startDate: string }) {
  await requireRole(db, userId, projectId, "schedule.edit");
  const template = TRACK_TEMPLATES.find((t) => t.value === input.template) ?? TRACK_TEMPLATES.at(-1)!;
  const name = input.name.trim() || template.defaultName;
  if (template.phases.length && !isDate(input.startDate)) throw new InputError("Tanggal mulai wajib diisi untuk template.");
  await db.transaction(async (tx) => {
    const [track] = await tx.insert(tracks).values({ projectId, name, sortOrder: 999 }).returning();
    const made = new Map<string, { id: string; due: string }>();
    for (const p of template.phases) {
      const preds = (p.after ?? []).map((n) => made.get(n)!);
      const start = preds.length ? addDays(preds.map((x) => x.due).sort().at(-1)!, 1) : input.startDate;
      const due = addDays(start, p.days - 1);
      const [item] = await tx
        .insert(scheduleItems)
        .values({ projectId, trackId: track.id, name: p.name, startDate: start, dueDate: due, baselineStart: start, baselineDue: due })
        .returning();
      made.set(p.name, { id: item.id, due });
      if (preds.length) await tx.insert(dependencies).values(preds.map((x) => ({ itemId: item.id, dependsOnId: x.id })));
    }
    await record(tx, { projectId, userId, entity: "track", entityId: track.id, action: "create", summary: `Menambah track "${name}" (${template.label}, ${template.phases.length} fase)` });
  });
}

export async function deleteTrack(db: Db, userId: string, projectId: string, trackId: string) {
  await requireRole(db, userId, projectId, "schedule.edit");
  await db.transaction(async (tx) => {
    const ids = await tx.select({ id: scheduleItems.id }).from(scheduleItems).where(and(eq(scheduleItems.trackId, trackId), eq(scheduleItems.projectId, projectId)));
    await dropItemExtras(tx, ids.map((i) => i.id));
    const [gone] = await tx.delete(tracks).where(and(eq(tracks.id, trackId), eq(tracks.projectId, projectId))).returning();
    if (gone) await record(tx, { projectId, userId, entity: "track", entityId: trackId, action: "delete", summary: `Menghapus track "${gone.name}" beserta isinya` });
  });
}

// ---------- items ----------

export type NewItemInput = { trackId: string; parentId: string | null; name: string; startDate: string; dueDate: string };

export async function addItem(db: Db, userId: string, projectId: string, input: NewItemInput) {
  await requireRole(db, userId, projectId, "schedule.edit");
  const name = input.name.trim();
  if (!name) throw new InputError("Nama item wajib diisi.");
  const due = input.dueDate || input.startDate; // a milestone is a single day
  checkDates(input.startDate, due);
  await db.transaction(async (tx) => {
    const [track] = await tx.select().from(tracks).where(and(eq(tracks.id, input.trackId), eq(tracks.projectId, projectId)));
    if (!track) throw new InputError("Track tidak ditemukan.");
    if (input.parentId) {
      const parent = await loadItem(tx, projectId, input.parentId);
      if (parent.trackId !== track.id || parent.parentId) throw new InputError("Milestone harus berada di dalam fase pada track yang sama.");
    }
    const [item] = await tx
      .insert(scheduleItems)
      .values({ projectId, trackId: track.id, parentId: input.parentId, name, startDate: input.startDate, dueDate: due, baselineStart: input.startDate, baselineDue: due })
      .returning();
    await record(tx, { projectId, userId, entity: "schedule_item", entityId: item.id, action: "create", summary: `Menambah ${input.parentId ? "milestone" : "fase"} "${name}" di ${track.name} (${fmtRange(input.startDate, due)})` });
  });
}

export type ItemDetails = { name: string; picContactId: string | null; hardDeadline: boolean; internal: boolean };

/** Everything except dates and status. Returns whether anything changed. */
export async function updateItemDetails(db: Db, userId: string, projectId: string, itemId: string, input: ItemDetails) {
  await requireRole(db, userId, projectId, "schedule.edit");
  const name = input.name.trim();
  if (!name) throw new InputError("Nama item wajib diisi.");
  return db.transaction(async (tx) => {
    const item = await loadItem(tx, projectId, itemId);
    if (input.picContactId) {
      const [c] = await tx.select({ id: teamContacts.id }).from(teamContacts).where(and(eq(teamContacts.id, input.picContactId), eq(teamContacts.projectId, projectId)));
      if (!c) throw new InputError("PIC tidak ditemukan di direktori tim.");
    }
    const before = { name: item.name, picContactId: item.picContactId, hardDeadline: item.hardDeadline, internal: item.internal };
    const after = { ...input, name };
    if (JSON.stringify(before) === JSON.stringify(after)) return false;
    await tx.update(scheduleItems).set({ ...after, updatedAt: new Date() }).where(eq(scheduleItems.id, itemId));
    await record(tx, { projectId, userId, entity: "schedule_item", entityId: itemId, action: "update", summary: `Mengubah detail "${name}"`, before, after });
    return true;
  });
}

export async function setItemStatus(db: Db, userId: string, projectId: string, itemId: string, input: { status: string; notes?: string }) {
  await requireRole(db, userId, projectId, "schedule.status");
  const status = STATUSES.find((s) => s.value === input.status)?.value as ItemStatus | undefined;
  if (!status) throw new InputError("Status tidak valid.");
  await db.transaction(async (tx) => {
    const item = await loadItem(tx, projectId, itemId);
    const notes = input.notes === undefined ? item.notes : input.notes.trim(); // omitted = keep
    if (item.status === status && item.notes === notes) return;
    await tx.update(scheduleItems).set({ status, notes, updatedAt: new Date() }).where(eq(scheduleItems.id, itemId));
    await record(tx, { projectId, userId, entity: "schedule_item", entityId: itemId, action: "update", summary: `Memperbarui status "${item.name}"`, before: { status: item.status, notes: item.notes }, after: { status, notes } });
  });
}

/** Records that someone chased this item; resets its "no update" clock. */
export async function markFollowedUp(db: Db, userId: string, projectId: string, itemId: string, note = "") {
  await requireRole(db, userId, projectId, "schedule.status");
  await db.transaction(async (tx) => {
    const item = await loadItem(tx, projectId, itemId);
    await tx.update(scheduleItems).set({ updatedAt: new Date() }).where(eq(scheduleItems.id, itemId));
    await record(tx, { projectId, userId, entity: "schedule_item", entityId: itemId, action: "update", summary: `Follow-up "${item.name}"`, reason: note.trim() });
  });
}

export async function deleteItem(db: Db, userId: string, projectId: string, itemId: string) {
  await requireRole(db, userId, projectId, "schedule.edit");
  await db.transaction(async (tx) => {
    const item = await loadItem(tx, projectId, itemId);
    const gone = await tx.delete(scheduleItems).where(or(eq(scheduleItems.id, itemId), eq(scheduleItems.parentId, itemId))).returning({ id: scheduleItems.id });
    await dropItemExtras(tx, gone.map((g) => g.id));
    await record(tx, { projectId, userId, entity: "schedule_item", entityId: itemId, action: "delete", summary: `Menghapus "${item.name}"`, before: item });
  });
}

// ---------- dependencies ----------

async function loadGraph(tx: Tx | Db, projectId: string) {
  const items = await tx.select().from(scheduleItems).where(eq(scheduleItems.projectId, projectId));
  const deps = items.length ? await tx.select().from(dependencies).where(inArray(dependencies.itemId, items.map((i) => i.id))) : [];
  return { items, deps };
}

export async function addDependency(db: Db, userId: string, projectId: string, itemId: string, dependsOnId: string) {
  await requireRole(db, userId, projectId, "schedule.edit");
  await db.transaction(async (tx) => {
    const [item, pred] = [await loadItem(tx, projectId, itemId), await loadItem(tx, projectId, dependsOnId)];
    const { deps } = await loadGraph(tx, projectId);
    if (wouldCycle(deps, itemId, dependsOnId)) throw new InputError(`"${pred.name}" sudah bergantung pada "${item.name}"; dependency ini akan berputar.`);
    await tx.insert(dependencies).values({ itemId, dependsOnId }).onConflictDoNothing();
    await record(tx, { projectId, userId, entity: "dependency", entityId: itemId, action: "create", summary: `"${item.name}" kini menunggu "${pred.name}"` });
  });
}

export async function removeDependency(db: Db, userId: string, projectId: string, itemId: string, dependsOnId: string) {
  await requireRole(db, userId, projectId, "schedule.edit");
  await db.transaction(async (tx) => {
    const [item, pred] = [await loadItem(tx, projectId, itemId), await loadItem(tx, projectId, dependsOnId)];
    await tx.delete(dependencies).where(and(eq(dependencies.itemId, itemId), eq(dependencies.dependsOnId, dependsOnId)));
    await record(tx, { projectId, userId, entity: "dependency", entityId: itemId, action: "delete", summary: `"${item.name}" tidak lagi menunggu "${pred.name}"` });
  });
}

// ---------- moving dates ----------

export type ShiftInput = { startDate: string; dueDate: string; cascade: boolean };

/** What a date change would do, without saving anything. */
export async function previewShift(db: Db, userId: string, projectId: string, itemId: string, input: ShiftInput) {
  await requireRole(db, userId, projectId, "schedule.edit");
  checkDates(input.startDate, input.dueDate);
  const item = await loadItem(db, projectId, itemId);
  const { items, deps } = await loadGraph(db, projectId);
  return { item, ...computeShift(items, deps, itemId, input.startDate, input.dueDate, input.cascade) };
}

export async function applyShift(db: Db, userId: string, projectId: string, itemId: string, input: ShiftInput, reason = "") {
  await requireRole(db, userId, projectId, "schedule.edit");
  checkDates(input.startDate, input.dueDate);
  return db.transaction(async (tx) => {
    const item = await loadItem(tx, projectId, itemId);
    const { items, deps } = await loadGraph(tx, projectId);
    const { moves, conflicts } = computeShift(items, deps, itemId, input.startDate, input.dueDate, input.cascade);
    if (!moves.length) return { moves, conflicts };
    const trackName = new Map((await tx.select().from(tracks).where(eq(tracks.projectId, projectId))).map((t) => [t.id, t.name]));
    const before: Record<string, string> = {};
    const after: Record<string, string> = {};
    for (const m of moves) {
      await tx.update(scheduleItems).set({ startDate: m.newStart, dueDate: m.newDue, updatedAt: new Date() }).where(eq(scheduleItems.id, m.id));
      const key = `${trackName.get(items.find((i) => i.id === m.id)!.trackId)} / ${m.name}`;
      before[key] = fmtRange(m.oldStart, m.oldDue);
      after[key] = fmtRange(m.newStart, m.newDue);
    }
    const others = moves.length - 1;
    await record(tx, {
      projectId, userId, entity: "schedule", entityId: itemId, action: "update",
      summary: `Mengubah jadwal "${item.name}"${others > 0 ? ` dan menggeser ${others} item lain` : ""}`,
      before, after, reason: reason.trim(),
    });
    return { moves, conflicts };
  });
}

/** Makes the current dates the new baseline for the whole project. */
export async function rebaseline(db: Db, userId: string, projectId: string, reason = "") {
  await requireRole(db, userId, projectId, "schedule.edit");
  await db.transaction(async (tx) => {
    const items = await tx.select().from(scheduleItems).where(eq(scheduleItems.projectId, projectId));
    for (const i of items) {
      if (i.baselineStart !== i.startDate || i.baselineDue !== i.dueDate) {
        await tx.update(scheduleItems).set({ baselineStart: i.startDate, baselineDue: i.dueDate }).where(eq(scheduleItems.id, i.id));
      }
    }
    await record(tx, { projectId, userId, entity: "schedule", entityId: projectId, action: "update", summary: "Menetapkan jadwal saat ini sebagai baseline baru", reason: reason.trim() });
  });
}

export type DateMove = { id: string; startDate: string; dueDate: string };

/** Sets exact dates on several items at once (used to undo a shift). One change-log entry. */
export async function applyMoves(db: Db, userId: string, projectId: string, moves: DateMove[], summary: string) {
  await requireRole(db, userId, projectId, "schedule.edit");
  for (const m of moves) checkDates(m.startDate, m.dueDate);
  await db.transaction(async (tx) => {
    const { items } = await loadGraph(tx, projectId);
    const byId = new Map(items.map((i) => [i.id, i]));
    const before: Record<string, string> = {};
    const after: Record<string, string> = {};
    for (const m of moves) {
      const item = byId.get(m.id);
      if (!item) throw new InputError("Item jadwal tidak ditemukan.");
      if (item.startDate === m.startDate && item.dueDate === m.dueDate) continue;
      await tx.update(scheduleItems).set({ startDate: m.startDate, dueDate: m.dueDate, updatedAt: new Date() }).where(eq(scheduleItems.id, m.id));
      before[item.name] = fmtRange(item.startDate, item.dueDate);
      after[item.name] = fmtRange(m.startDate, m.dueDate);
    }
    if (Object.keys(after).length) await record(tx, { projectId, userId, entity: "schedule", entityId: projectId, action: "update", summary, before, after });
  });
}

/** Per-project numbers for the project list: late items, next deadline, progress. */
export async function getProjectsOverview(db: Db, projectIds: string[], today: string) {
  const rows = projectIds.length ? await db.select().from(scheduleItems).where(inArray(scheduleItems.projectId, projectIds)) : [];
  return new Map(
    projectIds.map((id) => {
      const items = rows.filter((r) => r.projectId === id);
      const open = items.filter((i) => i.status !== "done");
      const next = open.filter((i) => i.dueDate >= today).sort((a, b) => a.dueDate.localeCompare(b.dueDate))[0];
      return [id, { total: items.length, done: items.length - open.length, late: open.filter((i) => i.dueDate < today).length, next: next ? { name: next.name, dueDate: next.dueDate } : null }];
    }),
  );
}
