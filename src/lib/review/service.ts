// Per-person reviewer links (no account) and milestone sign-offs.
import { randomBytes } from "node:crypto";
import { and, desc, eq, isNull, max } from "drizzle-orm";
import type { Db } from "@/db/client";
import { feedbackPoints, projects, reviewerLinks, scheduleItems, signoffs, users } from "@/db/schema";
import { parsePoints } from "../feedback/parse";
import { getSchedule } from "../schedule/service";
import { statusLabel } from "../schedule/templates";
import { InputError, pgSafe, record, requireRole } from "../services";

const clean = (v: string, n: number) => v.trim().slice(0, n);

/** Only non-internal milestones of this project may be assigned. */
async function validIds(db: Db, projectId: string, ids: string[]) {
  const s = await getSchedule(db, projectId, { includeInternal: false });
  const ok = new Set(s.tracks.flatMap((t) => t.items.filter((i) => i.parentId).map((i) => i.id)));
  return [...new Set(ids)].filter((id) => ok.has(id));
}

export async function listReviewerLinks(db: Db, userId: string, projectId: string) {
  await requireRole(db, userId, projectId, "access.manage");
  return db.select().from(reviewerLinks).where(eq(reviewerLinks.projectId, projectId)).orderBy(desc(reviewerLinks.createdAt));
}

export async function createReviewerLink(db: Db, userId: string, projectId: string, input: { name: string; role: string; itemIds: string[] }) {
  await requireRole(db, userId, projectId, "access.manage");
  const name = clean(input.name, 60);
  if (!name) throw new InputError("Nama reviewer wajib diisi.");
  const itemIds = await validIds(db, projectId, input.itemIds);
  return db.transaction(async (tx) => {
    const [link] = await tx.insert(reviewerLinks).values({ projectId, name, role: clean(input.role, 60), itemIds, createdBy: userId, token: randomBytes(24).toString("base64url") }).returning();
    await record(tx, { projectId, userId, entity: "reviewer_link", entityId: link.id, action: "create", summary: `Membuat link reviewer "${name}" (${itemIds.length} milestone)` });
    return link;
  });
}

export async function updateReviewerLinkItems(db: Db, userId: string, projectId: string, linkId: string, itemIds: string[]) {
  await requireRole(db, userId, projectId, "access.manage");
  const ids = await validIds(db, projectId, itemIds);
  await db.transaction(async (tx) => {
    const [link] = await tx.update(reviewerLinks).set({ itemIds: ids }).where(and(eq(reviewerLinks.id, linkId), eq(reviewerLinks.projectId, projectId), isNull(reviewerLinks.revokedAt))).returning();
    if (!link) throw new InputError("Link reviewer tidak ditemukan.");
    await record(tx, { projectId, userId, entity: "reviewer_link", entityId: linkId, action: "update", summary: `Mengubah milestone link reviewer "${link.name}" (${ids.length})`, after: { itemIds: ids } });
  });
}

export async function revokeReviewerLink(db: Db, userId: string, projectId: string, linkId: string) {
  await requireRole(db, userId, projectId, "access.manage");
  await db.transaction(async (tx) => {
    const [link] = await tx.update(reviewerLinks).set({ revokedAt: new Date() }).where(and(eq(reviewerLinks.id, linkId), eq(reviewerLinks.projectId, projectId), isNull(reviewerLinks.revokedAt))).returning();
    if (link) await record(tx, { projectId, userId, entity: "reviewer_link", entityId: linkId, action: "delete", summary: `Mencabut link reviewer "${link.name}"` });
  });
}

async function linkByToken(db: Db, token: string) {
  const [row] = await db.select().from(reviewerLinks).where(and(eq(reviewerLinks.token, token), isNull(reviewerLinks.revokedAt)));
  return row ?? null;
}

/** The milestones of this link that still exist and are visible. Single source for the page and both actions. */
async function assignedItems(db: Db, link: { projectId: string; itemIds: string[] }) {
  const s = await getSchedule(db, link.projectId, { includeInternal: false });
  const want = new Set(link.itemIds);
  return s.tracks.flatMap((t) =>
    t.items.filter((i) => i.parentId && want.has(i.id)).map((i) => ({ item: i, trackName: t.name, phaseName: t.items.find((p) => p.id === i.parentId)?.name ?? "" })),
  );
}

/** Explicit DTO for a reviewer page: no team, PIC, notes, links or other people's points. Null for unknown or revoked tokens. */
export async function getReviewerData(db: Db, token: string) {
  const link = await linkByToken(db, token);
  if (!link) return null;
  const [[project], assigned, points, signed] = await Promise.all([
    db.select({ name: projects.name }).from(projects).where(eq(projects.id, link.projectId)),
    assignedItems(db, link),
    db.select().from(feedbackPoints).where(eq(feedbackPoints.reviewerLinkId, link.id)).orderBy(feedbackPoints.sortOrder),
    db.select().from(signoffs).where(and(eq(signoffs.reviewerLinkId, link.id), isNull(signoffs.revokedAt))),
  ]);
  return {
    project: { name: project.name },
    reviewer: { name: link.name, role: link.role },
    items: assigned.map(({ item: i, trackName, phaseName }) => ({
      id: i.id, name: i.name, date: i.dueDate, phaseName, trackName, statusLabel: statusLabel(i.status),
      myPoints: points.filter((p) => p.itemId === i.id).map((p) => ({ id: p.id, ref: p.ref, body: p.body, status: p.status as string })),
      mySignoff: signed.find((x) => x.itemId === i.id) ? { createdAt: signed.find((x) => x.itemId === i.id)!.createdAt.toISOString() } : null,
    })),
  };
}

/** Throws the same message for unknown, revoked, unassigned, internal or vanished: nothing to probe. */
async function authorize(db: Db, token: string, itemId: string) {
  const link = await linkByToken(db, token);
  const found = link ? (await assignedItems(db, link)).find((a) => a.item.id === itemId) : undefined;
  if (!link || !found) throw new InputError("Link tidak berlaku atau milestone tidak ditugaskan.");
  return { link, item: found.item };
}

export async function submitReviewerFeedback(db: Db, token: string, itemId: string, text: string): Promise<number> {
  if (text.length > 10_000) throw new InputError("Feedback terlalu panjang (maksimal 10.000 karakter).");
  const parsed = parsePoints(text);
  if (!parsed.length) throw new InputError("Feedback kosong.");
  if (parsed.length > 100) throw new InputError("Maksimal 100 poin sekali kirim.");
  const { link, item } = await authorize(db, token, itemId);
  return db.transaction(async (tx) => {
    const [{ top }] = await tx.select({ top: max(feedbackPoints.sortOrder) }).from(feedbackPoints).where(eq(feedbackPoints.itemId, itemId));
    const rows = await tx
      .insert(feedbackPoints)
      .values(parsed.map((p, n) => ({ projectId: link.projectId, itemId, body: pgSafe(p.body), ref: pgSafe(p.ref.slice(0, 40)), fromWho: link.name.slice(0, 60), reviewerLinkId: link.id, sortOrder: (top ?? 0) + n + 1, createdBy: null })))
      .returning({ id: feedbackPoints.id });
    await record(tx, { projectId: link.projectId, userId: null, entity: "feedback", entityId: rows[0].id, action: "create", summary: `${link.name} (link reviewer) menambah ${rows.length} poin di "${item.name}"`, after: { points: parsed.slice(0, 20) } });
    return rows.length;
  });
}

export async function signoffViaLink(db: Db, token: string, itemId: string, note: string) {
  const { link, item } = await authorize(db, token, itemId);
  try {
    await db.transaction(async (tx) => {
      const [s] = await tx.insert(signoffs).values({ projectId: link.projectId, itemId, signerName: link.name, signerRole: link.role, reviewerLinkId: link.id, note: clean(note, 500) }).returning();
      await record(tx, { projectId: link.projectId, userId: null, entity: "signoff", entityId: s.id, action: "create", summary: `${link.name} (link reviewer) menyetujui "${item.name}"` });
    });
  } catch (e) {
    const err = e as { code?: string; cause?: { code?: string } };
    if (err.code === "23505" || err.cause?.code === "23505") throw new InputError("Sudah disetujui.");
    throw e;
  }
}

export async function recordSignoff(db: Db, userId: string, projectId: string, itemId: string, input: { signerName: string; signerRole: string; note: string; evidenceUrl: string }) {
  await requireRole(db, userId, projectId, "schedule.edit");
  const signerName = clean(input.signerName, 60);
  if (!signerName) throw new InputError("Nama penyetuju wajib diisi.");
  const evidenceUrl = input.evidenceUrl.trim();
  if (evidenceUrl && !/^https?:\/\/\S+$/i.test(evidenceUrl)) throw new InputError("Link bukti harus diawali http:// atau https://.");
  await db.transaction(async (tx) => {
    const [item] = await tx.select({ name: scheduleItems.name, parentId: scheduleItems.parentId }).from(scheduleItems).where(and(eq(scheduleItems.id, itemId), eq(scheduleItems.projectId, projectId)));
    if (!item?.parentId) throw new InputError("Persetujuan hanya untuk milestone.");
    const [s] = await tx.insert(signoffs).values({ projectId, itemId, signerName, signerRole: clean(input.signerRole, 60), recordedBy: userId, note: clean(input.note, 500), evidenceUrl: evidenceUrl.slice(0, 500) }).returning();
    await record(tx, { projectId, userId, entity: "signoff", entityId: s.id, action: "create", summary: `Mencatat persetujuan ${signerName} untuk "${item.name}"` });
  });
}

export async function revokeSignoff(db: Db, userId: string, projectId: string, signoffId: string, reason: string) {
  await requireRole(db, userId, projectId, "schedule.edit");
  const why = clean(reason, 500);
  if (!why) throw new InputError("Alasan mencabut persetujuan wajib diisi.");
  await db.transaction(async (tx) => {
    const [s] = await tx.update(signoffs).set({ revokedAt: new Date(), revokedBy: userId, revokeReason: why }).where(and(eq(signoffs.id, signoffId), eq(signoffs.projectId, projectId), isNull(signoffs.revokedAt))).returning();
    if (!s) throw new InputError("Persetujuan tidak ditemukan.");
    await record(tx, { projectId, userId, entity: "signoff", entityId: s.id, action: "update", summary: `Mencabut persetujuan ${s.signerName}`, reason: why });
  });
}

/** Active and revoked, newest first. */
export async function listSignoffs(db: Db, projectId: string) {
  const rows = await db
    .select({ s: signoffs, by: users.name })
    .from(signoffs)
    .leftJoin(users, eq(users.id, signoffs.recordedBy))
    .where(eq(signoffs.projectId, projectId))
    .orderBy(desc(signoffs.createdAt));
  return rows.map(({ s, by }) => ({ ...s, recordedByName: by, createdAt: s.createdAt.toISOString(), revokedAt: s.revokedAt?.toISOString() ?? null }));
}
export type Signoff = Awaited<ReturnType<typeof listSignoffs>>[number];
