import { and, asc, desc, eq, inArray } from "drizzle-orm";
import { z } from "zod";
import type { Db } from "@/db/client";
import { scriptScenes, scripts } from "@/db/schema";
import { InputError, record, requireRole, type Tx } from "../services";
import { aggregate } from "./aggregate";
import { getSchedule } from "../schedule/service";
import { needsByPhase, type Phase } from "./needs";
import { defaultPhase } from "./tags";
import { INT_EXTS, TAG_KINDS, TAG_LABEL, TIMES_OF_DAY, type PostTag, type TagKind } from "./types";

const str = (max: number) => z.string().max(max).transform((s) => s.trim());
const TagSchema = z.object({ kind: z.enum(TAG_KINDS), note: str(200).default(""), auto: z.boolean().default(true), keyword: str(30).optional() });
const page = z.number().finite().min(0).max(1000);

/** What the upload preview sends back for saving. Everything is re-validated; nothing from the client is trusted. */
export const ImportSchema = z.object({
  title: str(200).refine((s) => s.length > 0),
  sourceName: str(200),
  pages: z.number().int().min(1).max(400),
  scenes: z
    .array(
      z.object({
        number: str(20).refine((s) => s.length > 0),
        heading: str(200),
        intExt: z.enum(["INT", "EXT", "INT/EXT", ""]),
        location: str(200),
        timeOfDay: z.enum([...TIMES_OF_DAY, ""]),
        pageStart: page,
        pageEnd: page,
        lines: z.number().int().min(0).max(5000),
        estSeconds: z.number().int().min(0).max(7200),
        characters: z.array(z.object({ name: str(40).refine((s) => s.length > 0), blocks: z.number().int().min(0).max(1000) })).max(80),
        postTags: z.array(TagSchema).max(TAG_KINDS.length).default([]),
      }),
    )
    .min(1)
    .max(1500),
});
/** Untrusted input; ImportSchema is the real contract. */
export type ImportInput = { title: string; sourceName: string; pages: number; scenes: object[] };

export async function importScript(db: Db, userId: string, projectId: string, input: ImportInput) {
  await requireRole(db, userId, projectId, "script.edit");
  const parsed = ImportSchema.safeParse(input);
  if (!parsed.success) throw new InputError("Data naskah tidak valid. Unggah ulang file PDF.");
  const d = parsed.data;
  const phases = await listPhases(db, projectId);
  return db.transaction(async (tx) => {
    const [s] = await tx.insert(scripts).values({ projectId, title: d.title, sourceName: d.sourceName, pages: d.pages, createdBy: userId }).returning();
    // itemId is never taken from the client: the link is derived from the project's own phases. One tag per kind.
    const rows = d.scenes.map((x, i) => ({ ...x, postTags: x.postTags.filter((t, k, a) => a.findIndex((o) => o.kind === t.kind) === k).map((t) => ({ ...t, itemId: defaultPhase(t.kind, phases) })), scriptId: s.id, projectId, position: i + 1, location: x.location.toUpperCase() }));
    for (let i = 0; i < rows.length; i += 200) await tx.insert(scriptScenes).values(rows.slice(i, i + 200));
    await record(tx, { projectId, userId, entity: "script", entityId: s.id, action: "create", summary: `Mengimpor naskah "${s.title}": ${rows.length} adegan, ${d.pages} halaman` });
    return { scriptId: s.id, scenes: rows.length };
  });
}

export const listScripts = (db: Db, projectId: string) => db.select().from(scripts).where(eq(scripts.projectId, projectId)).orderBy(desc(scripts.createdAt));
export type ScriptRow = Awaited<ReturnType<typeof listScripts>>[number];

export async function getScript(db: Db, projectId: string, scriptId: string) {
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(scriptId)) return null; // empty or malformed ids are just "not found"
  const [script] = await db.select().from(scripts).where(and(eq(scripts.id, scriptId), eq(scripts.projectId, projectId)));
  if (!script) return null;
  const scenes = await db.select().from(scriptScenes).where(eq(scriptScenes.scriptId, scriptId)).orderBy(asc(scriptScenes.position));
  return { script, scenes, aggregate: aggregate(scenes, script.pages) };
}
export type SceneRow = NonNullable<Awaited<ReturnType<typeof getScript>>>["scenes"][number];

export type ScenePatch = { heading?: string; number?: string; location?: string; intExt?: string; timeOfDay?: string; notes?: string };

export async function updateScene(db: Db, userId: string, projectId: string, sceneId: string, patch: ScenePatch) {
  await requireRole(db, userId, projectId, "script.edit");
  const next: Partial<Pick<SceneRow, "heading" | "number" | "location" | "intExt" | "timeOfDay" | "notes">> = {};
  const clip = (v: string, max: number) => v.trim().slice(0, max);
  if (patch.heading != null) next.heading = clip(patch.heading, 200);
  if (patch.number != null) {
    next.number = clip(patch.number, 20).toUpperCase();
    if (!next.number) throw new InputError("Nomor adegan wajib diisi.");
  }
  if (patch.location != null) next.location = clip(patch.location, 200).toUpperCase();
  if (patch.intExt != null) {
    if (![...INT_EXTS, ""].includes(patch.intExt as never)) throw new InputError("INT/EXT tidak valid.");
    next.intExt = patch.intExt;
  }
  if (patch.timeOfDay != null) {
    if (![...TIMES_OF_DAY, ""].includes(patch.timeOfDay as never)) throw new InputError("Waktu tidak valid.");
    next.timeOfDay = patch.timeOfDay;
  }
  if (patch.notes != null) next.notes = clip(patch.notes, 2000);
  await db.transaction(async (tx) => {
    const [row] = await tx.select().from(scriptScenes).where(and(eq(scriptScenes.id, sceneId), eq(scriptScenes.projectId, projectId)));
    if (!row) throw new InputError("Adegan tidak ditemukan.");
    const keys = (Object.keys(next) as (keyof typeof next)[]).filter((k) => next[k] !== row[k]);
    if (!keys.length) return;
    await tx.update(scriptScenes).set(next).where(eq(scriptScenes.id, sceneId));
    await record(tx, {
      projectId, userId, entity: "script_scene", entityId: sceneId, action: "update", summary: `Adegan ${row.number}: ${keys.join(", ")} diubah`,
      before: Object.fromEntries(keys.map((k) => [k, row[k]])), after: Object.fromEntries(keys.map((k) => [k, next[k]])),
    });
  });
}

export async function deleteScene(db: Db, userId: string, projectId: string, sceneId: string) {
  await requireRole(db, userId, projectId, "script.edit");
  await db.transaction(async (tx) => {
    const [row] = await tx.delete(scriptScenes).where(and(eq(scriptScenes.id, sceneId), eq(scriptScenes.projectId, projectId))).returning();
    if (!row) throw new InputError("Adegan tidak ditemukan.");
    await record(tx, { projectId, userId, entity: "script_scene", entityId: sceneId, action: "delete", summary: `Menghapus adegan ${row.number} "${row.heading}"`, before: row });
  });
}

export async function deleteScript(db: Db, userId: string, projectId: string, scriptId: string) {
  await requireRole(db, userId, projectId, "script.edit");
  await db.transaction(async (tx) => {
    const [row] = await tx.delete(scripts).where(and(eq(scripts.id, scriptId), eq(scripts.projectId, projectId))).returning();
    if (!row) throw new InputError("Naskah tidak ditemukan.");
    await record(tx, { projectId, userId, entity: "script", entityId: scriptId, action: "delete", summary: `Menghapus naskah "${row.title}"` });
  });
}

// ---------- post-production tags ----------

/** Top-level phases of the schedule (milestones excluded), with their dates. */
export async function listPhases(db: Db, projectId: string): Promise<Phase[]> {
  const { tracks } = await getSchedule(db, projectId, { includeInternal: true });
  return tracks.flatMap((t) => t.items.filter((i) => !i.parentId).map((i) => ({ id: i.id, name: i.name, startDate: i.startDate, dueDate: i.dueDate, track: t.name })));
}

const kindOf = (k: string): TagKind => {
  if (!(TAG_KINDS as readonly string[]).includes(k)) throw new InputError("Jenis tag tidak valid.");
  return k as TagKind;
};

async function loadScenes(tx: Tx | Db, projectId: string, ids: string[]) {
  const rows = ids.length ? await tx.select().from(scriptScenes).where(and(inArray(scriptScenes.id, ids), eq(scriptScenes.projectId, projectId))) : [];
  if (!ids.length || rows.length !== new Set(ids).size) throw new InputError("Adegan tidak ditemukan.");
  return rows;
}

/**
 * Adds (or replaces) the tag of one kind on the given scenes, confirmed (auto: false). `itemId` undefined = default phase for the kind,
 * null = no phase, a string = that phase (must be a phase of this project). The auto keyword is kept.
 */
export async function setTags(db: Db, userId: string, projectId: string, sceneIds: string[], input: { kind: string; note?: string; itemId?: string | null }) {
  await requireRole(db, userId, projectId, "script.edit");
  const kind = kindOf(input.kind);
  const note = (input.note ?? "").trim().slice(0, 200);
  const phases = await listPhases(db, projectId);
  let itemId: string | null;
  if (input.itemId === undefined) itemId = defaultPhase(kind, phases);
  else if (input.itemId === null || input.itemId === "") itemId = null;
  else if (phases.some((p) => p.id === input.itemId)) itemId = input.itemId;
  else throw new InputError("Fase tidak ditemukan.");
  await db.transaction(async (tx) => {
    const rows = await loadScenes(tx, projectId, sceneIds);
    for (const r of rows) {
      const old = r.postTags.find((t) => t.kind === kind);
      const next: PostTag = { kind, note, auto: false, itemId, ...(old?.keyword ? { keyword: old.keyword } : {}) };
      await tx.update(scriptScenes).set({ postTags: [...r.postTags.filter((t) => t.kind !== kind), next] }).where(eq(scriptScenes.id, r.id));
    }
    const one = rows.length === 1;
    await record(tx, {
      projectId, userId, entity: one ? "script_scene" : "script", entityId: one ? rows[0].id : rows[0].scriptId, action: "update",
      summary: one ? `Adegan ${rows[0].number}: tag ${TAG_LABEL[kind]} diatur` : `Tag ${TAG_LABEL[kind]} ditambahkan ke ${rows.length} adegan`,
      after: { kind, note, itemId },
    });
  });
}

/** Confirms a parser suggestion (auto -> false) or removes a tag. */
async function changeTag(db: Db, userId: string, projectId: string, sceneId: string, kindIn: string, mode: "confirm" | "remove") {
  await requireRole(db, userId, projectId, "script.edit");
  const kind = kindOf(kindIn);
  await db.transaction(async (tx) => {
    const [row] = await loadScenes(tx, projectId, [sceneId]);
    const old = row.postTags.find((t) => t.kind === kind);
    if (!old) throw new InputError("Tag tidak ditemukan.");
    const next = mode === "remove" ? row.postTags.filter((t) => t.kind !== kind) : row.postTags.map((t) => (t.kind === kind ? { ...t, auto: false } : t));
    await tx.update(scriptScenes).set({ postTags: next }).where(eq(scriptScenes.id, sceneId));
    await record(tx, {
      projectId, userId, entity: "script_scene", entityId: sceneId, action: mode === "remove" ? "delete" : "update",
      summary: `Adegan ${row.number}: tag ${TAG_LABEL[kind]} ${mode === "remove" ? "dihapus" : "dikonfirmasi"}`, before: { kind, auto: old.auto, itemId: old.itemId ?? null },
    });
  });
}
export const confirmTag = (db: Db, userId: string, projectId: string, sceneId: string, kind: string) => changeTag(db, userId, projectId, sceneId, kind, "confirm");
export const removeTag = (db: Db, userId: string, projectId: string, sceneId: string, kind: string) => changeTag(db, userId, projectId, sceneId, kind, "remove");

/** For the timeline drawer: the latest script's tags grouped by linked phase. Null when the project has no script. */
export async function getPhaseNeeds(db: Db, projectId: string) {
  const [script] = await db.select({ id: scripts.id }).from(scripts).where(eq(scripts.projectId, projectId)).orderBy(desc(scripts.createdAt)).limit(1);
  if (!script) return null;
  const scenes = await db.select({ number: scriptScenes.number, estSeconds: scriptScenes.estSeconds, postTags: scriptScenes.postTags }).from(scriptScenes).where(eq(scriptScenes.scriptId, script.id)).orderBy(asc(scriptScenes.position));
  return { scriptId: script.id, byPhase: needsByPhase(scenes as { number: string; estSeconds: number; postTags: PostTag[] }[]) };
}
