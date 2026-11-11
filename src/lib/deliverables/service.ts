import { and, asc, eq, inArray } from "drizzle-orm";
import type { Db } from "@/db/client";
import { attachments, comments, deliverables, tracks, type DeliverableStatus } from "@/db/schema";
import { isDate } from "../schedule/dates";
import { InputError, getTechSpec, record, requireRole, type Tx } from "../services";
import { cleanSpec, DELIVERABLE_STATUSES, deliverableStatus, getPreset, resolveSpec } from "./catalog";

export async function listDeliverables(db: Db, projectId: string, opts: { includeInternal: boolean }) {
  return db
    .select()
    .from(deliverables)
    .where(opts.includeInternal ? eq(deliverables.projectId, projectId) : and(eq(deliverables.projectId, projectId), eq(deliverables.internal, false)))
    .orderBy(asc(deliverables.platform), asc(deliverables.sortOrder), asc(deliverables.createdAt));
}

export type Deliverable = Awaited<ReturnType<typeof listDeliverables>>[number];

async function checkTrack(tx: Tx | Db, projectId: string, trackId: string | null) {
  if (!trackId) return "";
  const [t] = await tx.select().from(tracks).where(and(eq(tracks.id, trackId), eq(tracks.projectId, projectId)));
  if (!t) throw new InputError("Track tidak ditemukan.");
  return t.name;
}

const dueOrNull = (d: string | null | undefined) => {
  if (!d) return null;
  if (!isDate(d)) throw new InputError("Tanggal tidak valid.");
  return d;
};

/** Same name + platform + track counts as already present, so presets can be re-applied safely. */
const key = (d: { name: string; platform: string; trackId: string | null }) => `${d.trackId ?? ""}|${d.platform}|${d.name}`.toLowerCase();

async function insertNew(tx: Tx, projectId: string, rows: (typeof deliverables.$inferInsert)[]) {
  const existing = new Set((await tx.select().from(deliverables).where(eq(deliverables.projectId, projectId))).map(key));
  const fresh = rows.filter((r) => !existing.has(key({ name: r.name, platform: r.platform ?? "", trackId: r.trackId ?? null })));
  if (fresh.length) await tx.insert(deliverables).values(fresh);
  return { added: fresh.length, skipped: rows.length - fresh.length };
}

// ---------- generating ----------

export type PresetInput = { presetId: string; trackId: string | null; dueDate: string | null; skip?: number[] };

/** Adds the preset's checklist, filling "@" values from the Technical Page. */
export async function applyPreset(db: Db, userId: string, projectId: string, input: PresetInput) {
  await requireRole(db, userId, projectId, "deliverable.edit");
  const preset = getPreset(input.presetId);
  if (!preset) throw new InputError("Preset tidak ditemukan.");
  const dueDate = dueOrNull(input.dueDate);
  const tech = await getTechSpec(db, projectId);
  const skip = new Set(input.skip ?? []);
  return db.transaction(async (tx) => {
    const trackName = await checkTrack(tx, projectId, input.trackId);
    const rows = preset.items.flatMap((item, n) =>
      skip.has(n) ? [] : [{
        projectId, trackId: input.trackId, platform: preset.platform, groupName: item.group, name: item.name,
        spec: resolveSpec(item.spec, tech), origin: item.origin ?? ("delivered" as const), dueDate: item.origin === "derived" ? null : dueDate,
        presetId: preset.id, presetVersion: preset.specVersion, sortOrder: n,
      }],
    );
    const result = await insertNew(tx, projectId, rows);
    if (result.added) {
      await record(tx, { projectId, userId, entity: "deliverable", entityId: projectId, action: "create", summary: `Menambah ${result.added} deliverable dari preset "${preset.label}" (${preset.specVersion})${trackName ? ` untuk ${trackName}` : ""}` });
    }
    return result;
  });
}

export type CutdownInput = { content: string; platform: string; trackId: string | null; durations: string[]; ratios: string[]; dueDate: string | null };

/** One deliverable per duration x ratio. */
export async function generateCutdowns(db: Db, userId: string, projectId: string, input: CutdownInput) {
  await requireRole(db, userId, projectId, "deliverable.edit");
  const content = input.content.trim();
  const durations = [...new Set(input.durations.map((d) => d.trim()).filter(Boolean))];
  const ratios = [...new Set(input.ratios.map((r) => r.trim()).filter(Boolean))];
  if (!content) throw new InputError("Nama konten wajib diisi (mis. Trailer, TVC).");
  if (!durations.length || !ratios.length) throw new InputError("Pilih minimal satu durasi dan satu ratio.");
  if (durations.length * ratios.length > 100) throw new InputError("Terlalu banyak kombinasi (maksimal 100).");
  const dueDate = dueOrNull(input.dueDate);
  return db.transaction(async (tx) => {
    await checkTrack(tx, projectId, input.trackId);
    const rows = durations.flatMap((duration, i) =>
      ratios.map((aspectRatio, j) => ({
        projectId, trackId: input.trackId, platform: input.platform.trim(), groupName: "Cutdown", name: `${content} ${duration} ${aspectRatio}`,
        spec: { duration, aspectRatio, format: "MP4 H.264" }, dueDate, presetId: `cutdown:${content}`, sortOrder: 1000 + i * 20 + j,
      })),
    );
    const result = await insertNew(tx, projectId, rows);
    if (result.added) {
      await record(tx, { projectId, userId, entity: "deliverable", entityId: projectId, action: "create", summary: `Membuat matriks cutdown "${content}": ${durations.length} durasi × ${ratios.length} ratio (${result.added} deliverable)` });
    }
    return result;
  });
}

// ---------- single items ----------

export type DeliverableInput = {
  name: string; platform: string; groupName: string; trackId: string | null; spec: Record<string, unknown>;
  origin: string; dueDate: string | null; notes: string; internal: boolean;
};

async function clean(tx: Tx, projectId: string, input: DeliverableInput) {
  const name = input.name.trim();
  if (!name) throw new InputError("Nama deliverable wajib diisi.");
  await checkTrack(tx, projectId, input.trackId);
  return {
    name, platform: input.platform.trim(), groupName: input.groupName.trim(), trackId: input.trackId, spec: cleanSpec(input.spec),
    origin: input.origin === "derived" ? ("derived" as const) : ("delivered" as const), dueDate: dueOrNull(input.dueDate), notes: input.notes.trim(), internal: input.internal,
  };
}

export async function addDeliverable(db: Db, userId: string, projectId: string, input: DeliverableInput) {
  await requireRole(db, userId, projectId, "deliverable.edit");
  await db.transaction(async (tx) => {
    const data = await clean(tx, projectId, input);
    const [d] = await tx.insert(deliverables).values({ ...data, projectId, sortOrder: 5000 }).returning();
    await record(tx, { projectId, userId, entity: "deliverable", entityId: d.id, action: "create", summary: `Menambah deliverable "${d.name}"${d.platform ? ` (${d.platform})` : ""}`, after: data });
  });
}

async function load(tx: Tx, projectId: string, id: string) {
  const [d] = await tx.select().from(deliverables).where(and(eq(deliverables.id, id), eq(deliverables.projectId, projectId)));
  if (!d) throw new InputError("Deliverable tidak ditemukan.");
  return d;
}

export async function updateDeliverable(db: Db, userId: string, projectId: string, id: string, input: DeliverableInput) {
  await requireRole(db, userId, projectId, "deliverable.edit");
  await db.transaction(async (tx) => {
    const d = await load(tx, projectId, id);
    const data = await clean(tx, projectId, input);
    const before = { name: d.name, platform: d.platform, groupName: d.groupName, trackId: d.trackId, spec: d.spec, origin: d.origin, dueDate: d.dueDate, notes: d.notes, internal: d.internal };
    if (JSON.stringify(before) === JSON.stringify(data)) return;
    await tx.update(deliverables).set(data).where(eq(deliverables.id, id));
    await record(tx, { projectId, userId, entity: "deliverable", entityId: id, action: "update", summary: `Mengubah deliverable "${data.name}"`, before: { ...before, spec: JSON.stringify(before.spec) }, after: { ...data, spec: JSON.stringify(data.spec) } });
  });
}

export async function setDeliverableStatus(db: Db, userId: string, projectId: string, id: string, status: string) {
  await requireRole(db, userId, projectId, "deliverable.status");
  const next = DELIVERABLE_STATUSES.find((s) => s.value === status)?.value as DeliverableStatus | undefined;
  if (!next) throw new InputError("Status tidak valid.");
  await db.transaction(async (tx) => {
    const d = await load(tx, projectId, id);
    if (d.origin === "derived") throw new InputError("Item ini diturunkan platform, tidak punya status pengiriman.");
    if (d.status === next) return;
    await tx.update(deliverables).set({ status: next }).where(eq(deliverables.id, id));
    await record(tx, { projectId, userId, entity: "deliverable", entityId: id, action: "update", summary: `Deliverable "${d.name}": ${deliverableStatus(next).label}`, before: { status: deliverableStatus(d.status).label }, after: { status: deliverableStatus(next).label } });
  });
}

/** Deletes deliverables together with their links and comments. */
export async function deleteDeliverables(db: Db, userId: string, projectId: string, ids: string[]) {
  await requireRole(db, userId, projectId, "deliverable.edit");
  if (!ids.length) return 0;
  return db.transaction(async (tx) => {
    const gone = await tx.delete(deliverables).where(and(eq(deliverables.projectId, projectId), inArray(deliverables.id, ids))).returning();
    if (!gone.length) return 0;
    const goneIds = gone.map((g) => g.id);
    await tx.delete(attachments).where(and(eq(attachments.targetType, "deliverable"), inArray(attachments.targetId, goneIds)));
    await tx.delete(comments).where(and(eq(comments.targetType, "deliverable"), inArray(comments.targetId, goneIds)));
    await record(tx, { projectId, userId, entity: "deliverable", entityId: projectId, action: "delete", summary: gone.length === 1 ? `Menghapus deliverable "${gone[0].name}"` : `Menghapus ${gone.length} deliverable`, before: { names: gone.map((g) => g.name) } });
    return gone.length;
  });
}
