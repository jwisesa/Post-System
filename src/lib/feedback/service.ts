import { and, asc, eq, max } from "drizzle-orm";
import type { Db } from "@/db/client";
import { feedbackPoints, scheduleItems, users, type FeedbackStatus } from "@/db/schema";
import { InputError, record, requireRole, type Tx } from "../services";
import { parsePoints } from "./parse";

export { carryOver, parsePoints } from "./parse";

async function loadItem(tx: Tx | Db, projectId: string, itemId: string) {
  const [i] = await tx.select().from(scheduleItems).where(and(eq(scheduleItems.id, itemId), eq(scheduleItems.projectId, projectId)));
  if (!i) throw new InputError("Item jadwal tidak ditemukan.");
  return i;
}

async function loadPoint(tx: Tx | Db, projectId: string, pointId: string) {
  const [p] = await tx.select().from(feedbackPoints).where(and(eq(feedbackPoints.id, pointId), eq(feedbackPoints.projectId, projectId)));
  if (!p) throw new InputError("Poin feedback tidak ditemukan.");
  return p;
}

export async function listPoints(db: Db, projectId: string, opts: { includeInternal: boolean }) {
  const [rows, items] = await Promise.all([
    db
      .select({ p: feedbackPoints, author: users.name })
      .from(feedbackPoints)
      .leftJoin(users, eq(users.id, feedbackPoints.createdBy))
      .where(eq(feedbackPoints.projectId, projectId))
      .orderBy(asc(feedbackPoints.sortOrder), asc(feedbackPoints.createdAt)),
    db.select({ id: scheduleItems.id, parentId: scheduleItems.parentId, internal: scheduleItems.internal }).from(scheduleItems).where(eq(scheduleItems.projectId, projectId)),
  ]);
  const hidden = new Set<string>();
  if (!opts.includeInternal) {
    for (const i of items) if (i.internal) hidden.add(i.id);
    for (const i of items) if (i.parentId && hidden.has(i.parentId)) hidden.add(i.id);
  }
  return rows
    .filter(({ p }) => !hidden.has(p.itemId))
    .map(({ p, author }) => ({ ...p, author: author ?? "—", createdAt: p.createdAt.toISOString(), checkedAt: p.checkedAt?.toISOString() ?? null }));
}

export type FeedbackPoint = Awaited<ReturnType<typeof listPoints>>[number];

export async function addPoints(db: Db, userId: string, projectId: string, itemId: string, input: { text: string; fromWho?: string }) {
  await requireRole(db, userId, projectId, "comment.add");
  const parsed = parsePoints(input.text);
  if (!parsed.length) throw new InputError("Feedback kosong.");
  const fromWho = (input.fromWho ?? "").trim().slice(0, 60);
  return db.transaction(async (tx) => {
    const item = await loadItem(tx, projectId, itemId);
    const [{ top }] = await tx.select({ top: max(feedbackPoints.sortOrder) }).from(feedbackPoints).where(eq(feedbackPoints.itemId, itemId));
    const rows = await tx
      .insert(feedbackPoints)
      .values(parsed.map((p, n) => ({ projectId, itemId, body: p.body, ref: p.ref, fromWho, sortOrder: (top ?? 0) + n + 1, createdBy: userId })))
      .returning({ id: feedbackPoints.id });
    await record(tx, { projectId, userId, entity: "feedback", entityId: rows[0].id, action: "create", summary: `Menambah ${rows.length} poin feedback di "${item.name}"`, after: { points: parsed.slice(0, 20), fromWho } });
    return rows.length;
  });
}

export async function updatePoint(db: Db, userId: string, projectId: string, pointId: string, input: { body: string; ref: string; fromWho: string }) {
  await requireRole(db, userId, projectId, "schedule.edit");
  const body = input.body.trim();
  if (!body) throw new InputError("Isi feedback wajib diisi.");
  await db.transaction(async (tx) => {
    const p = await loadPoint(tx, projectId, pointId);
    const after = { body: body.slice(0, 1000), ref: input.ref.trim().slice(0, 40), fromWho: input.fromWho.trim().slice(0, 60) };
    const before = { body: p.body, ref: p.ref, fromWho: p.fromWho };
    if (JSON.stringify(before) === JSON.stringify(after)) return;
    await tx.update(feedbackPoints).set(after).where(eq(feedbackPoints.id, p.id));
    await record(tx, { projectId, userId, entity: "feedback", entityId: p.id, action: "update", summary: "Mengubah poin feedback", before, after });
  });
}

export async function deletePoint(db: Db, userId: string, projectId: string, pointId: string) {
  await requireRole(db, userId, projectId, "schedule.edit");
  await db.transaction(async (tx) => {
    const p = await loadPoint(tx, projectId, pointId);
    await tx.delete(feedbackPoints).where(eq(feedbackPoints.id, p.id));
    await record(tx, { projectId, userId, entity: "feedback", entityId: p.id, action: "delete", summary: "Menghapus poin feedback", before: { body: p.body.slice(0, 200), ref: p.ref } });
  });
}

const STATUS_LABEL: Record<FeedbackStatus, string> = { open: "belum dicek", fixed: "sudah", dropped: "tidak dikerjakan" };

export async function checkPoint(db: Db, userId: string, projectId: string, pointId: string, input: { status: string; checkedItemId: string | null; note: string }) {
  await requireRole(db, userId, projectId, "schedule.status");
  const status = input.status as FeedbackStatus;
  if (!(status in STATUS_LABEL)) throw new InputError("Status tidak valid.");
  await db.transaction(async (tx) => {
    const p = await loadPoint(tx, projectId, pointId);
    let at: string | null = null;
    if (status !== "open") {
      if (!input.checkedItemId) throw new InputError("Pilih milestone tempat poin ini dicek.");
      at = (await loadItem(tx, projectId, input.checkedItemId)).name;
    }
    const set = status === "open"
      ? { status, checkedItemId: null, checkNote: "", checkedBy: null, checkedAt: null }
      : { status, checkedItemId: input.checkedItemId, checkNote: input.note.trim().slice(0, 500), checkedBy: userId, checkedAt: new Date() };
    await tx.update(feedbackPoints).set(set).where(eq(feedbackPoints.id, p.id));
    await record(tx, {
      projectId, userId, entity: "feedback", entityId: p.id, action: "update",
      summary: `Feedback "${p.body.slice(0, 60)}": ${STATUS_LABEL[status]}${at ? ` (dicek di ${at})` : ""}`,
      before: { status: p.status }, after: { status }, reason: set.checkNote,
    });
  });
}
