import { and, asc, desc, eq, inArray, notInArray, or, sql } from "drizzle-orm";
import type { Db } from "@/db/client";
import { attachments, comments, feedbackPoints, dependencies, projects, scheduleItems, scheduleVersions, teamContacts, tracks, users, type ItemStatus, type ScheduleSettings, type ScheduleSnapshot } from "@/db/schema";
import { InputError, record, requireRole, type Tx } from "../services";
import { addDays, diffDays, fmtRange, isDate } from "./dates";
import { computeShift, wouldCycle, type Dep } from "./shift";
import { PHASE_COLORS, STATUSES, TRACK_TEMPLATES } from "./templates";
import { calOf, hoursPerDayOf, snap } from "./workdays";

export type Item = typeof scheduleItems.$inferSelect;

/** Tracks with their items (phases by start date, milestones under their phase) plus dependencies. */
export async function getSchedule(db: Db, projectId: string, opts: { includeInternal: boolean }) {
  const [trackRows, itemRows, contacts, [project]] = await Promise.all([
    db.select().from(tracks).where(eq(tracks.projectId, projectId)).orderBy(asc(tracks.sortOrder), asc(tracks.createdAt)),
    db.select().from(scheduleItems).where(eq(scheduleItems.projectId, projectId)).orderBy(asc(scheduleItems.startDate), asc(scheduleItems.createdAt)),
    db.select({ id: teamContacts.id, name: teamContacts.name, internal: teamContacts.internal }).from(teamContacts).where(eq(teamContacts.projectId, projectId)),
    db.select({ settings: projects.scheduleSettings }).from(projects).where(eq(projects.id, projectId)),
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
    settings: project?.settings ?? {},
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

/** Links, comments and feedback points point at items by id without a foreign key, so remove them with the items. */
async function dropItemExtras(tx: Tx, itemIds: string[]) {
  if (!itemIds.length) return;
  await tx.delete(attachments).where(and(eq(attachments.targetType, "schedule_item"), inArray(attachments.targetId, itemIds)));
  await tx.delete(comments).where(and(eq(comments.targetType, "schedule_item"), inArray(comments.targetId, itemIds)));
  await tx.delete(feedbackPoints).where(inArray(feedbackPoints.itemId, itemIds));
  // Points that were cross-checked at a vanished milestone go back to open.
  await tx.update(feedbackPoints).set({ status: "open", checkedItemId: null, checkNote: "", checkedBy: null, checkedAt: null }).where(inArray(feedbackPoints.checkedItemId, itemIds));
}

// ---------- tracks ----------

export async function addTrack(db: Db, userId: string, projectId: string, input: { name: string; template: string; startDate: string }) {
  await requireRole(db, userId, projectId, "schedule.edit");
  const template = TRACK_TEMPLATES.find((t) => t.value === input.template) ?? TRACK_TEMPLATES.at(-1)!;
  const name = input.name.trim() || template.defaultName;
  if (template.phases.length && !isDate(input.startDate)) throw new InputError("Tanggal mulai wajib diisi untuk template.");
  await db.transaction(async (tx) => {
    const [project] = await tx.select({ settings: projects.scheduleSettings }).from(projects).where(eq(projects.id, projectId));
    const cal = calOf(project?.settings);
    const [track] = await tx.insert(tracks).values({ projectId, name, sortOrder: 999 }).returning();
    const made = new Map<string, { id: string; due: string }>();
    for (const p of template.phases) {
      const preds = (p.after ?? []).map((n) => made.get(n)!);
      const start = snap(cal, preds.length ? addDays(preds.map((x) => x.due).sort().at(-1)!, 1) : input.startDate);
      const end = snap(cal, addDays(start, p.days - 1), -1);
      const due = end < start ? start : end;
      const [item] = await tx
        .insert(scheduleItems)
        .values({ projectId, trackId: track.id, name: p.name, color: p.color, startDate: start, dueDate: due, baselineStart: start, baselineDue: due })
        .returning();
      made.set(p.name, { id: item.id, due });
      if (preds.length) await tx.insert(dependencies).values(preds.map((x) => ({ itemId: item.id, dependsOnId: x.id })));
      // Every phase arrives with its usual single-date milestones, ready to be dated.
      const span = diffDays(start, due);
      const stones = (p.milestones ?? []).map((m) => {
        const on = snap(cal, addDays(start, Math.round(m.at * span)), -1);
        const date = on < start ? start : on;
        return { projectId, trackId: track.id, parentId: item.id, name: m.name, startDate: date, dueDate: date, baselineStart: date, baselineDue: date };
      });
      if (stones.length) await tx.insert(scheduleItems).values(stones);
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

export type NewItemInput = { trackId: string; parentId: string | null; name: string; startDate: string; dueDate: string; color?: number | null; workHours?: number | null };

const cleanColor = (c: number | null | undefined) => (c && Number.isInteger(c) && c >= 1 && c <= PHASE_COLORS ? c : null);
const cleanHours = (h: number | null | undefined) => (h && Number.isInteger(h) && h >= 1 && h <= 9999 ? h : null);

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
      .values({ projectId, trackId: track.id, parentId: input.parentId, name, color: cleanColor(input.color), workHours: input.parentId ? null : cleanHours(input.workHours), startDate: input.startDate, dueDate: due, baselineStart: input.startDate, baselineDue: due })
      .returning();
    await record(tx, { projectId, userId, entity: "schedule_item", entityId: item.id, action: "create", summary: `Menambah ${input.parentId ? "milestone" : "fase"} "${name}" di ${track.name} (${fmtRange(input.startDate, due)})` });
  });
}

export type ItemDetails = { name: string; picContactId: string | null; hardDeadline: boolean; internal: boolean; color?: number | null; workHours?: number | null };

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
    const before = { name: item.name, picContactId: item.picContactId, hardDeadline: item.hardDeadline, internal: item.internal, color: item.color, workHours: item.workHours };
    const after = { name, picContactId: input.picContactId, hardDeadline: input.hardDeadline, internal: input.internal, color: input.color === undefined ? item.color : cleanColor(input.color), workHours: item.parentId || input.workHours === undefined ? item.workHours : cleanHours(input.workHours) };
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

/** Same status and/or colour on several items at once. One change-log entry. */
export async function updateItems(db: Db, userId: string, projectId: string, itemIds: string[], patch: { status?: string; color?: number | null }) {
  const status = patch.status === undefined ? undefined : (STATUSES.find((s) => s.value === patch.status)?.value as ItemStatus | undefined);
  if (patch.status !== undefined && !status) throw new InputError("Status tidak valid.");
  await requireRole(db, userId, projectId, patch.color !== undefined ? "schedule.edit" : "schedule.status");
  if (!itemIds.length) return;
  const set = { ...(status ? { status } : {}), ...(patch.color !== undefined ? { color: cleanColor(patch.color) } : {}), updatedAt: new Date() };
  await db.transaction(async (tx) => {
    const done = await tx.update(scheduleItems).set(set).where(and(eq(scheduleItems.projectId, projectId), inArray(scheduleItems.id, itemIds))).returning({ id: scheduleItems.id });
    if (done.length) await record(tx, { projectId, userId, entity: "schedule", entityId: projectId, action: "update", summary: `Mengubah ${status ? "status" : "warna"} ${done.length} item`, after: patch });
  });
}

export async function deleteItems(db: Db, userId: string, projectId: string, itemIds: string[]) {
  await requireRole(db, userId, projectId, "schedule.edit");
  if (!itemIds.length) return;
  await db.transaction(async (tx) => {
    const gone = await tx.delete(scheduleItems)
      .where(and(eq(scheduleItems.projectId, projectId), or(inArray(scheduleItems.id, itemIds), inArray(scheduleItems.parentId, itemIds))))
      .returning({ id: scheduleItems.id, name: scheduleItems.name });
    await dropItemExtras(tx, gone.map((g) => g.id));
    if (gone.length) await record(tx, { projectId, userId, entity: "schedule", entityId: projectId, action: "delete", summary: `Menghapus ${gone.length} item jadwal`, before: gone.map((g) => g.name) });
  });
}

// ---------- dependencies ----------

async function loadGraph(tx: Tx | Db, projectId: string) {
  const items = await tx.select().from(scheduleItems).where(eq(scheduleItems.projectId, projectId));
  const deps = items.length ? await tx.select().from(dependencies).where(inArray(dependencies.itemId, items.map((i) => i.id))) : [];
  const [project] = await tx.select({ settings: projects.scheduleSettings }).from(projects).where(eq(projects.id, projectId));
  return { items, deps, cal: calOf(project?.settings) };
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
  const { items, deps, cal } = await loadGraph(db, projectId);
  return { item, ...computeShift(items, deps, itemId, input.startDate, input.dueDate, input.cascade, cal) };
}

export async function applyShift(db: Db, userId: string, projectId: string, itemId: string, input: ShiftInput, reason = "") {
  await requireRole(db, userId, projectId, "schedule.edit");
  checkDates(input.startDate, input.dueDate);
  return db.transaction(async (tx) => {
    const item = await loadItem(tx, projectId, itemId);
    const { items, deps, cal } = await loadGraph(tx, projectId);
    const { moves, conflicts } = computeShift(items, deps, itemId, input.startDate, input.dueDate, input.cascade, cal);
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

// ---------- working-day settings ----------

export async function updateScheduleSettings(db: Db, userId: string, projectId: string, input: ScheduleSettings) {
  await requireRole(db, userId, projectId, "schedule.edit");
  const holidays = (input.holidays ?? [])
    .filter((h) => isDate(h.date))
    .map((h) => ({ date: h.date, name: String(h.name ?? "").trim().slice(0, 80) }))
    .sort((a, b) => a.date.localeCompare(b.date));
  const next: ScheduleSettings = { skipWeekends: input.skipWeekends !== false, cascade: Boolean(input.cascade), national: input.national !== false, jointLeave: input.jointLeave !== false, hoursPerDay: hoursPerDayOf(input), holidays: [...new Map(holidays.map((h) => [h.date, h])).values()] };
  await db.transaction(async (tx) => {
    const [before] = await tx.select({ settings: projects.scheduleSettings }).from(projects).where(eq(projects.id, projectId));
    if (JSON.stringify(before?.settings) === JSON.stringify(next)) return;
    await tx.update(projects).set({ scheduleSettings: next }).where(eq(projects.id, projectId));
    await record(tx, { projectId, userId, entity: "schedule", entityId: projectId, action: "update", summary: "Mengubah aturan hari kerja timeline", before: before?.settings, after: next });
  });
}

// ---------- saved versions ----------

async function snapshot(tx: Tx | Db, projectId: string): Promise<ScheduleSnapshot> {
  const t = await tx.select({ id: tracks.id, name: tracks.name, sortOrder: tracks.sortOrder }).from(tracks).where(eq(tracks.projectId, projectId)).orderBy(asc(tracks.sortOrder), asc(tracks.createdAt));
  const rows = await tx.select().from(scheduleItems).where(eq(scheduleItems.projectId, projectId));
  const items = rows.map((i) => ({
    id: i.id, trackId: i.trackId, parentId: i.parentId, name: i.name, startDate: i.startDate, dueDate: i.dueDate, baselineStart: i.baselineStart, baselineDue: i.baselineDue,
    status: i.status, picContactId: i.picContactId, hardDeadline: i.hardDeadline, internal: i.internal, notes: i.notes, color: i.color, workHours: i.workHours,
  }));
  const deps = items.length ? await tx.select().from(dependencies).where(inArray(dependencies.itemId, items.map((i) => i.id))) : [];
  return { tracks: t, items, deps };
}

export async function saveVersion(db: Db, userId: string, projectId: string, name: string) {
  await requireRole(db, userId, projectId, "schedule.edit");
  const label = name.trim();
  if (!label) throw new InputError("Nama versi wajib diisi.");
  await db.transaction(async (tx) => {
    const [v] = await tx.insert(scheduleVersions).values({ projectId, name: label, snapshot: await snapshot(tx, projectId), createdBy: userId }).returning({ id: scheduleVersions.id });
    await record(tx, { projectId, userId, entity: "schedule_version", entityId: v.id, action: "create", summary: `Menyimpan versi timeline "${label}"` });
  });
}

export async function listVersions(db: Db, projectId: string) {
  return db
    .select({ id: scheduleVersions.id, name: scheduleVersions.name, createdAt: scheduleVersions.createdAt, by: users.name, items: sql<number>`jsonb_array_length(${scheduleVersions.snapshot}->'items')` })
    .from(scheduleVersions).leftJoin(users, eq(users.id, scheduleVersions.createdBy))
    .where(eq(scheduleVersions.projectId, projectId)).orderBy(desc(scheduleVersions.createdAt));
}

export type VersionRow = Awaited<ReturnType<typeof listVersions>>[number];

export async function deleteVersion(db: Db, userId: string, projectId: string, versionId: string) {
  await requireRole(db, userId, projectId, "schedule.edit");
  await db.transaction(async (tx) => {
    const [gone] = await tx.delete(scheduleVersions).where(and(eq(scheduleVersions.id, versionId), eq(scheduleVersions.projectId, projectId))).returning({ name: scheduleVersions.name });
    if (gone) await record(tx, { projectId, userId, entity: "schedule_version", entityId: versionId, action: "delete", summary: `Menghapus versi timeline "${gone.name}"` });
  });
}

/**
 * Puts the timeline back exactly as it was when the version was saved. The current
 * state is saved as a version first, so a restore can itself be undone. Items keep
 * their ids, so links and comments on items that exist in both stay attached.
 */
export async function restoreVersion(db: Db, userId: string, projectId: string, versionId: string) {
  await requireRole(db, userId, projectId, "schedule.edit");
  await db.transaction(async (tx) => {
    const [v] = await tx.select().from(scheduleVersions).where(and(eq(scheduleVersions.id, versionId), eq(scheduleVersions.projectId, projectId)));
    if (!v) throw new InputError("Versi tidak ditemukan.");
    await tx.insert(scheduleVersions).values({ projectId, name: `Sebelum memulihkan "${v.name}"`, snapshot: await snapshot(tx, projectId), createdBy: userId });
    const snap = v.snapshot;
    const keepItems = snap.items.map((i) => i.id);
    const keepTracks = snap.tracks.map((t) => t.id);
    const current = await tx.select({ id: scheduleItems.id }).from(scheduleItems).where(eq(scheduleItems.projectId, projectId));
    const dropped = current.map((c) => c.id).filter((id) => !keepItems.includes(id));
    await dropItemExtras(tx, dropped);
    if (current.length) await tx.delete(dependencies).where(inArray(dependencies.itemId, current.map((c) => c.id)));
    if (dropped.length) await tx.delete(scheduleItems).where(inArray(scheduleItems.id, dropped));
    await tx.delete(tracks).where(and(eq(tracks.projectId, projectId), keepTracks.length ? notInArray(tracks.id, keepTracks) : undefined));
    for (const t of snap.tracks) {
      await tx.insert(tracks).values({ ...t, projectId }).onConflictDoUpdate({ target: tracks.id, set: { name: t.name, sortOrder: t.sortOrder } });
    }
    // A PIC removed from the team since the version was saved cannot be pointed at any more.
    const contacts = new Set((await tx.select({ id: teamContacts.id }).from(teamContacts).where(eq(teamContacts.projectId, projectId))).map((c) => c.id));
    for (const i of snap.items) {
      const row = { ...i, workHours: i.workHours ?? null, projectId, picContactId: i.picContactId && contacts.has(i.picContactId) ? i.picContactId : null, updatedAt: new Date() };
      await tx.insert(scheduleItems).values(row).onConflictDoUpdate({ target: scheduleItems.id, set: row });
    }
    if (snap.deps.length) await tx.insert(dependencies).values(snap.deps).onConflictDoNothing();
    await record(tx, { projectId, userId, entity: "schedule_version", entityId: versionId, action: "update", summary: `Memulihkan timeline ke versi "${v.name}"` });
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
