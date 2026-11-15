import { and, asc, eq, inArray } from "drizzle-orm";
import type { Db } from "@/db/client";
import { shots, type ShotStatus } from "@/db/schema";
import { InputError, record, requireRole } from "../services";
import { SHOT_STATUSES, shotStatus, type ShotInput } from "./edl";

export const listShots = (db: Db, projectId: string) => db.select().from(shots).where(eq(shots.projectId, projectId)).orderBy(asc(shots.recIn), asc(shots.name));
export type Shot = Awaited<ReturnType<typeof listShots>>[number];

const TC = /^\d{2}[:;]\d{2}[:;]\d{2}[:;]\d{2}$/;
const short = (v: unknown, max = 300) => String(v ?? "").trim().slice(0, max);

/**
 * Saves shots from the EDL tool. A shot name that already exists gets its editorial fields (timecodes, reel, ...)
 * replaced by the new cut and keeps its status, vendor, version and notes. Unnamed rows are skipped.
 */
export async function saveShots(db: Db, userId: string, projectId: string, input: ShotInput[]) {
  await requireRole(db, userId, projectId, "shot.edit");
  if (input.length > 2000) throw new InputError("Terlalu banyak shot sekaligus (maksimal 2000).");
  const rows = input.map((r) => {
    for (const tc of [r.srcIn, r.srcOut, r.recIn, r.recOut]) if (!TC.test(String(tc))) throw new InputError("Timecode tidak valid.");
    if (!Number.isInteger(r.durationFrames) || r.durationFrames < 0 || !Number.isInteger(r.handles) || r.handles < 0) throw new InputError("Durasi atau handles tidak valid.");
    return {
      name: short(r.name, 120), reel: short(r.reel), clipName: short(r.clipName), sourceFile: short(r.sourceFile),
      srcIn: r.srcIn, srcOut: r.srcOut, recIn: r.recIn, recOut: r.recOut,
      durationFrames: r.durationFrames, fps: short(r.fps, 12), handles: r.handles, scope: short(r.scope), retime: short(r.retime, 60),
    };
  });
  const named = rows.filter((r) => r.name);
  if (!named.length) throw new InputError("Tidak ada shot bernama. Isi pola nama shot atau beri marker di timeline.");
  const twice = named.find((r, i) => named.findIndex((x) => x.name === r.name) !== i);
  if (twice) throw new InputError(`Nama shot ganda: "${twice.name}". Pakai pola nama shot supaya unik.`);

  return db.transaction(async (tx) => {
    const existing = new Set((await tx.select({ name: shots.name }).from(shots).where(eq(shots.projectId, projectId))).map((s) => s.name));
    for (const r of named) {
      if (existing.has(r.name)) await tx.update(shots).set({ ...r, updatedAt: new Date() }).where(and(eq(shots.projectId, projectId), eq(shots.name, r.name)));
    }
    const fresh = named.filter((r) => !existing.has(r.name));
    if (fresh.length) await tx.insert(shots).values(fresh.map((r) => ({ ...r, projectId })));
    const result = { added: fresh.length, updated: named.length - fresh.length, unnamed: rows.length - named.length };
    await record(tx, { projectId, userId, entity: "shot", entityId: projectId, action: "create", summary: `Menyimpan shot dari tool EDL: ${result.added} baru, ${result.updated} diperbarui` });
    return result;
  });
}

export type ShotPatch = { status?: string; vendor?: string; version?: string; notes?: string };

export async function updateShot(db: Db, userId: string, projectId: string, id: string, patch: ShotPatch) {
  await requireRole(db, userId, projectId, "shot.status");
  const next: Partial<{ status: ShotStatus; vendor: string; version: string; notes: string }> = {};
  if (patch.status != null) {
    const s = SHOT_STATUSES.find((x) => x.value === patch.status);
    if (!s) throw new InputError("Status tidak valid.");
    next.status = s.value;
  }
  if (patch.vendor != null) next.vendor = short(patch.vendor, 120);
  if (patch.version != null) next.version = short(patch.version, 40);
  if (patch.notes != null) next.notes = short(patch.notes, 2000);
  await db.transaction(async (tx) => {
    const [shot] = await tx.select().from(shots).where(and(eq(shots.id, id), eq(shots.projectId, projectId)));
    if (!shot) throw new InputError("Shot tidak ditemukan.");
    const keys = (Object.keys(next) as (keyof typeof next)[]).filter((k) => next[k] !== shot[k]);
    if (!keys.length) return;
    await tx.update(shots).set({ ...next, updatedAt: new Date() }).where(eq(shots.id, id));
    const label = (k: keyof typeof next, v: string) => (k === "status" ? shotStatus(v).label : v);
    await record(tx, {
      projectId, userId, entity: "shot", entityId: id, action: "update", summary: `Shot "${shot.name}": ${keys.map((k) => `${k} → ${label(k, next[k]!) || "—"}`).join(", ")}`,
      before: Object.fromEntries(keys.map((k) => [k, label(k, shot[k])])), after: Object.fromEntries(keys.map((k) => [k, label(k, next[k]!)])),
    });
  });
}

export async function deleteShots(db: Db, userId: string, projectId: string, ids: string[]) {
  await requireRole(db, userId, projectId, "shot.edit");
  if (!ids.length) return 0;
  return db.transaction(async (tx) => {
    const gone = await tx.delete(shots).where(and(eq(shots.projectId, projectId), inArray(shots.id, ids))).returning();
    if (gone.length) await record(tx, { projectId, userId, entity: "shot", entityId: projectId, action: "delete", summary: gone.length === 1 ? `Menghapus shot "${gone[0].name}"` : `Menghapus ${gone.length} shot` });
    return gone.length;
  });
}
