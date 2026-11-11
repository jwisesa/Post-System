import { and, asc, desc, eq, inArray } from "drizzle-orm";
import type { Db } from "@/db/client";
import { attachments, attachmentVersions, comments, scheduleItems, users, type AttachmentKind, type TargetType, type VersionStatus } from "@/db/schema";
import { InputError, getRole, record, requireRole, type Tx } from "../services";
import { KINDS, VERSION_STATUSES, versionStatus } from "./catalog";

function cleanUrl(input: string): string {
  const url = input.trim();
  let parsed: URL;
  try { parsed = new URL(url); } catch { throw new InputError("Link tidak valid. Tempel alamat lengkap, mis. https://drive.google.com/..."); }
  if (parsed.protocol !== "https:" && parsed.protocol !== "http:") throw new InputError("Link harus diawali http:// atau https://.");
  return url;
}

/** Confirms the target exists in this project and returns a name for the change log. */
async function targetName(tx: Tx | Db, projectId: string, targetType: string, targetId: string): Promise<string> {
  if (targetType === "project") {
    if (targetId !== projectId) throw new InputError("Target tidak ditemukan.");
    return "Dokumen project";
  }
  if (targetType !== "schedule_item") throw new InputError("Target tidak valid.");
  const [item] = await tx.select({ name: scheduleItems.name }).from(scheduleItems).where(and(eq(scheduleItems.id, targetId), eq(scheduleItems.projectId, projectId)));
  if (!item) throw new InputError("Item jadwal tidak ditemukan.");
  return item.name;
}

async function loadAttachment(tx: Tx | Db, projectId: string, attachmentId: string) {
  const [a] = await tx.select().from(attachments).where(and(eq(attachments.id, attachmentId), eq(attachments.projectId, projectId)));
  if (!a) throw new InputError("Link tidak ditemukan.");
  return a;
}

// ---------- reading ----------

/** Attachments with their versions, newest version first. */
export async function listAttachments(db: Db, projectId: string, opts: { includeInternal: boolean }) {
  const rows = await db
    .select()
    .from(attachments)
    .where(opts.includeInternal ? eq(attachments.projectId, projectId) : and(eq(attachments.projectId, projectId), eq(attachments.internal, false)))
    .orderBy(asc(attachments.createdAt));
  if (!rows.length) return [];
  const versions = await db
    .select({ v: attachmentVersions, author: users.name })
    .from(attachmentVersions)
    .leftJoin(users, eq(users.id, attachmentVersions.createdBy))
    .where(inArray(attachmentVersions.attachmentId, rows.map((r) => r.id)))
    .orderBy(desc(attachmentVersions.number));
  return rows.map((a) => ({
    ...a,
    versions: versions.filter((x) => x.v.attachmentId === a.id).map(({ v, author }) => ({ ...v, author: author ?? "—", createdAt: v.createdAt.toISOString() })),
  }));
}

export type Attachment = Awaited<ReturnType<typeof listAttachments>>[number];

export async function listComments(db: Db, projectId: string) {
  const rows = await db
    .select({ c: comments, author: users.name })
    .from(comments)
    .innerJoin(users, eq(users.id, comments.userId))
    .where(eq(comments.projectId, projectId))
    .orderBy(asc(comments.createdAt));
  return rows.map(({ c, author }) => ({ ...c, author, createdAt: c.createdAt.toISOString() }));
}

export type Comment = Awaited<ReturnType<typeof listComments>>[number];

// ---------- links and versions ----------

export type NewAttachment = { targetType: string; targetId: string; kind: string; label: string; url: string; notes: string; internal: boolean };

export async function addAttachment(db: Db, userId: string, projectId: string, input: NewAttachment) {
  await requireRole(db, userId, projectId, "asset.edit");
  const label = input.label.trim();
  if (!label) throw new InputError("Nama link wajib diisi.");
  const kind = KINDS.find((k) => k.value === input.kind)?.value as AttachmentKind | undefined;
  if (!kind) throw new InputError("Tipe link tidak valid.");
  const url = cleanUrl(input.url);
  await db.transaction(async (tx) => {
    const where = await targetName(tx, projectId, input.targetType, input.targetId);
    const [a] = await tx
      .insert(attachments)
      .values({ projectId, targetType: input.targetType as TargetType, targetId: input.targetId, kind, label, internal: input.internal, createdBy: userId })
      .returning();
    await tx.insert(attachmentVersions).values({ attachmentId: a.id, number: 1, url, notes: input.notes.trim(), createdBy: userId });
    await record(tx, { projectId, userId, entity: "attachment", entityId: a.id, action: "create", summary: `Menambah link "${label}" v1 di ${where}`, after: { url, notes: input.notes.trim() } });
  });
}

export async function addVersion(db: Db, userId: string, projectId: string, attachmentId: string, input: { url: string; notes: string }) {
  await requireRole(db, userId, projectId, "asset.edit");
  const url = cleanUrl(input.url);
  const notes = input.notes.trim();
  if (!notes) throw new InputError("Tulis apa yang berubah di versi ini.");
  return db.transaction(async (tx) => {
    const a = await loadAttachment(tx, projectId, attachmentId);
    const [latest] = await tx.select().from(attachmentVersions).where(eq(attachmentVersions.attachmentId, a.id)).orderBy(desc(attachmentVersions.number)).limit(1);
    const number = (latest?.number ?? 0) + 1;
    await tx.insert(attachmentVersions).values({ attachmentId: a.id, number, url, notes, createdBy: userId });
    await record(tx, { projectId, userId, entity: "attachment", entityId: a.id, action: "update", summary: `Menambah versi v${number} untuk "${a.label}"`, before: { url: latest?.url ?? "" }, after: { url }, reason: notes });
    return number;
  });
}

export async function setVersionStatus(db: Db, userId: string, projectId: string, versionId: string, status: string) {
  await requireRole(db, userId, projectId, "asset.approve");
  const next = VERSION_STATUSES.find((s) => s.value === status)?.value as VersionStatus | undefined;
  if (!next) throw new InputError("Status tidak valid.");
  await db.transaction(async (tx) => {
    const [row] = await tx
      .select({ v: attachmentVersions, a: attachments })
      .from(attachmentVersions)
      .innerJoin(attachments, eq(attachments.id, attachmentVersions.attachmentId))
      .where(and(eq(attachmentVersions.id, versionId), eq(attachments.projectId, projectId)));
    if (!row) throw new InputError("Versi tidak ditemukan.");
    if (row.v.status === next) return;
    await tx.update(attachmentVersions).set({ status: next, statusBy: userId }).where(eq(attachmentVersions.id, versionId));
    await record(tx, {
      projectId, userId, entity: "attachment", entityId: row.a.id, action: "update",
      summary: `"${row.a.label}" v${row.v.number}: ${versionStatus(next).label}`,
      before: { status: versionStatus(row.v.status).label }, after: { status: versionStatus(next).label },
    });
  });
}

export async function updateAttachment(db: Db, userId: string, projectId: string, attachmentId: string, input: { label: string; kind: string; internal: boolean }) {
  await requireRole(db, userId, projectId, "asset.edit");
  const label = input.label.trim();
  const kind = KINDS.find((k) => k.value === input.kind)?.value as AttachmentKind | undefined;
  if (!label || !kind) throw new InputError("Nama dan tipe link wajib valid.");
  await db.transaction(async (tx) => {
    const a = await loadAttachment(tx, projectId, attachmentId);
    const before = { label: a.label, kind: a.kind, internal: a.internal };
    const after = { label, kind, internal: input.internal };
    if (JSON.stringify(before) === JSON.stringify(after)) return;
    await tx.update(attachments).set(after).where(eq(attachments.id, a.id));
    await record(tx, { projectId, userId, entity: "attachment", entityId: a.id, action: "update", summary: `Mengubah link "${label}"`, before, after });
  });
}

export async function deleteAttachment(db: Db, userId: string, projectId: string, attachmentId: string) {
  await requireRole(db, userId, projectId, "asset.edit");
  await db.transaction(async (tx) => {
    const a = await loadAttachment(tx, projectId, attachmentId);
    await tx.delete(attachments).where(eq(attachments.id, a.id));
    await record(tx, { projectId, userId, entity: "attachment", entityId: a.id, action: "delete", summary: `Menghapus link "${a.label}" beserta semua versinya`, before: a });
  });
}

// ---------- comments ----------

export async function addComment(db: Db, userId: string, projectId: string, input: { targetType: string; targetId: string; body: string }) {
  await requireRole(db, userId, projectId, "comment.add");
  const body = input.body.trim();
  if (!body) throw new InputError("Komentar kosong.");
  await db.transaction(async (tx) => {
    const where = await targetName(tx, projectId, input.targetType, input.targetId);
    const [c] = await tx.insert(comments).values({ projectId, targetType: input.targetType as TargetType, targetId: input.targetId, userId, body: body.slice(0, 4000) }).returning();
    await record(tx, { projectId, userId, entity: "comment", entityId: c.id, action: "create", summary: `Berkomentar di ${where}`, after: { body: body.slice(0, 200) } });
  });
}

/** Authors can delete their own comments; supervisors can delete any. */
export async function deleteComment(db: Db, userId: string, projectId: string, commentId: string) {
  const role = await getRole(db, userId, projectId);
  await db.transaction(async (tx) => {
    const [c] = await tx.select().from(comments).where(and(eq(comments.id, commentId), eq(comments.projectId, projectId)));
    if (!c) throw new InputError("Komentar tidak ditemukan.");
    if (c.userId !== userId && role !== "supervisor") throw new InputError("Hanya penulis atau supervisor yang bisa menghapus komentar ini.");
    await tx.delete(comments).where(eq(comments.id, commentId));
    await record(tx, { projectId, userId, entity: "comment", entityId: commentId, action: "delete", summary: "Menghapus komentar", before: { body: c.body.slice(0, 200) } });
  });
}
