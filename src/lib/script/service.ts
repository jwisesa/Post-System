import { and, asc, desc, eq, inArray } from "drizzle-orm";
import { z } from "zod";
import type { Db } from "@/db/client";
import { scriptAliases, scriptSceneText, scriptScenes, scriptTagKinds, scripts } from "@/db/schema";
import { InputError, pgSafe, record, requireRole, type Tx } from "../services";
import { aggregate } from "./aggregate";
import { applyAliases, MAX_ALIASES, MAX_ALIAS_NAME, type AliasKind } from "./aliases";
import { getSchedule } from "../schedule/service";
import { needsByPhase, type Phase } from "./needs";
import { defaultPhase } from "./tags";
import { BLOCK_TYPES, BUILTIN_KINDS, INT_EXTS, isBuiltinKind, kindDef, MAX_BLOCK_CHARS, MAX_CUSTOM_KINDS, MAX_KIND_LABEL, MAX_TEXT_BYTES, TAG_KINDS, TIMES_OF_DAY, textBytes, withCustom, type Block, type KindDef, type PostTag } from "./types";

const omit = <T extends object, K extends keyof T>(o: T, k: K): Omit<T, K> => { const c = { ...o }; delete c[k]; return c; };
// Postgres jsonb/text reject \u0000; drop it and other control characters before anything is stored.
const clean = pgSafe;
const str = (max: number) => z.string().max(max).transform((s) => clean(s).trim());
const TagSchema = z.object({ kind: z.enum(TAG_KINDS), note: str(200).default(""), auto: z.boolean().default(true), keyword: str(30).optional(), excerpt: str(500).optional() });
const BlockSchema = z.object({ t: z.enum(BLOCK_TYPES as [string, ...string[]]), text: z.string().max(MAX_BLOCK_CHARS).transform(clean), ext: z.string().max(60).transform(clean).optional() });
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
        blocks: z.array(BlockSchema).max(3000).default([]),
      }),
    )
    .min(1)
    .max(1500)
    .refine((scenes) => scenes.reduce((n, x) => n + textBytes(x.blocks as Block[]), 0) <= MAX_TEXT_BYTES, "Teks naskah lebih dari 2,5 MB."),
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
    const texts = d.scenes.map((x) => x.blocks as Block[]);
    const rows = d.scenes.map((x, i) => ({ ...omit(x, "blocks"), postTags: x.postTags.filter((t, k, a) => a.findIndex((o) => o.kind === t.kind) === k).map((t) => ({ ...t, itemId: defaultPhase(t.kind, phases) })), scriptId: s.id, projectId, position: i + 1, location: x.location.toUpperCase() }));
    const ids: string[] = [];
    for (let i = 0; i < rows.length; i += 200) ids.push(...(await tx.insert(scriptScenes).values(rows.slice(i, i + 200)).returning({ id: scriptScenes.id })).map((r) => r.id));
    const textRows = ids.flatMap((sceneId, i) => (texts[i].length ? [{ sceneId, projectId, blocks: texts[i] }] : []));
    for (let i = 0; i < textRows.length; i += 20) await tx.insert(scriptSceneText).values(textRows.slice(i, i + 20));
    await record(tx, { projectId, userId, entity: "script", entityId: s.id, action: "create", summary: `Mengimpor naskah "${s.title}": ${rows.length} adegan, ${d.pages} halaman${textRows.length ? ", dengan teks" : ""}` });
    return { scriptId: s.id, scenes: rows.length };
  });
}

export const listScripts = (db: Db, projectId: string) => db.select().from(scripts).where(eq(scripts.projectId, projectId)).orderBy(desc(scripts.createdAt));
export type ScriptRow = Awaited<ReturnType<typeof listScripts>>[number];

export async function getScript(db: Db, projectId: string, scriptId: string) {
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(scriptId)) return null; // empty or malformed ids are just "not found"
  const [script] = await db.select().from(scripts).where(and(eq(scripts.id, scriptId), eq(scripts.projectId, projectId)));
  if (!script) return null;
  const raw = await db.select().from(scriptScenes).where(eq(scriptScenes.scriptId, scriptId)).orderBy(asc(scriptScenes.position));
  const aliases = await listAliases(db, scriptId);
  const scenes = applyAliases(raw, aliases); // every consumer (page, CSV, print) reads through here
  const textIds = (await db.select({ id: scriptSceneText.sceneId }).from(scriptSceneText).innerJoin(scriptScenes, eq(scriptScenes.id, scriptSceneText.sceneId)).where(eq(scriptScenes.scriptId, scriptId))).map((r) => r.id);
  return { script, scenes, aggregate: aggregate(scenes, script.pages), textIds, aliases: aliases.map((a) => ({ kind: a.kind, fromName: a.fromName, toName: a.toName })) };
}
export type SceneRow = NonNullable<Awaited<ReturnType<typeof getScript>>>["scenes"][number];

export type ScenePatch = { heading?: string; number?: string; location?: string; intExt?: string; timeOfDay?: string; notes?: string };

export async function updateScene(db: Db, userId: string, projectId: string, sceneId: string, patch: ScenePatch) {
  await requireRole(db, userId, projectId, "script.edit");
  const next: Partial<Pick<SceneRow, "heading" | "number" | "location" | "intExt" | "timeOfDay" | "notes">> = {};
  const clip = (v: string, max: number) => pgSafe(v.trim().slice(0, max));
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

// ---------- name merging (reversible aliases) ----------

export const listAliases = (db: Db | Tx, scriptId: string) => db.select().from(scriptAliases).where(eq(scriptAliases.scriptId, scriptId)).orderBy(asc(scriptAliases.createdAt), asc(scriptAliases.fromName));

const KINDS: AliasKind[] = ["character", "location"];
const noun = (k: string, n: number) => `${n} ${k === "character" ? "karakter" : "lokasi"}`;

/** Supervisor: `names` (as displayed) become `canonical`. Chains are flattened, so every alias points straight at a final name. */
export async function mergeNames(db: Db, userId: string, projectId: string, scriptId: string, kind: AliasKind, names: string[], canonicalIn: string) {
  await requireRole(db, userId, projectId, "script.edit");
  if (!KINDS.includes(kind)) throw new InputError("Jenis tidak valid.");
  const canonical = pgSafe(canonicalIn).replace(/\s+/g, " ").trim().toUpperCase();
  const from = [...new Set(names.map((n) => pgSafe(n).replace(/\s+/g, " ").trim().toUpperCase()))].filter((n) => n && n !== canonical);
  if (!canonical) throw new InputError("Nama utama wajib diisi.");
  if (canonical.length > MAX_ALIAS_NAME || from.some((n) => n.length > MAX_ALIAS_NAME)) throw new InputError(`Nama maksimal ${MAX_ALIAS_NAME} karakter.`);
  if (kind === "location" && /\s[-–—]\s/.test(canonical)) throw new InputError("Nama lokasi utama tidak boleh memuat \" - \"; gunakan nama tempatnya saja.");
  if (!from.length) throw new InputError("Pilih setidaknya satu nama lain untuk digabungkan.");
  await db.transaction(async (tx) => {
    const [script] = await tx.select({ id: scripts.id }).from(scripts).where(and(eq(scripts.id, scriptId), eq(scripts.projectId, projectId)));
    if (!script) throw new InputError("Naskah tidak ditemukan.");
    const all = (await listAliases(tx, scriptId)).filter((a) => a.kind === kind);
    const gone = all.filter((a) => a.fromName === canonical).map((a) => a.id); // the main name stops being an alias itself
    const keep = all.filter((a) => !gone.includes(a.id));
    const repoint = keep.filter((a) => from.includes(a.toName) && !from.includes(a.fromName) && a.fromName !== canonical); // earlier merges into a name that is now merged away
    const total = new Set([...keep.map((a) => a.fromName), ...from]).size;
    if (total > MAX_ALIASES) throw new InputError(`Maksimal ${MAX_ALIASES} penggabungan per naskah.`);
    if (gone.length) await tx.delete(scriptAliases).where(inArray(scriptAliases.id, gone));
    for (const a of repoint) await tx.update(scriptAliases).set({ toName: canonical }).where(eq(scriptAliases.id, a.id));
    for (const n of from) {
      await tx.insert(scriptAliases).values({ scriptId, projectId, kind, fromName: n, toName: canonical, createdBy: userId })
        .onConflictDoUpdate({ target: [scriptAliases.scriptId, scriptAliases.kind, scriptAliases.fromName], set: { toName: canonical } });
    }
    await record(tx, { projectId, userId, entity: "script", entityId: scriptId, action: "update", summary: `Menggabungkan ${noun(kind, from.length + 1)}` });
  });
}

/** Supervisor: restores one merged-away name. */
export async function unmerge(db: Db, userId: string, projectId: string, scriptId: string, kind: AliasKind, fromName: string) {
  await requireRole(db, userId, projectId, "script.edit");
  await db.transaction(async (tx) => {
    const rows = await tx.delete(scriptAliases).where(and(eq(scriptAliases.scriptId, scriptId), eq(scriptAliases.projectId, projectId), eq(scriptAliases.kind, kind), eq(scriptAliases.fromName, fromName))).returning({ id: scriptAliases.id });
    if (!rows.length) throw new InputError("Penggabungan tidak ditemukan.");
    await record(tx, { projectId, userId, entity: "script", entityId: scriptId, action: "update", summary: `Memisahkan ${noun(kind, 1)}` });
  });
}

// ---------- post-production tags ----------

/** Top-level phases of the schedule (milestones excluded), with their dates. */
export async function listPhases(db: Db, projectId: string): Promise<Phase[]> {
  const { tracks } = await getSchedule(db, projectId, { includeInternal: true });
  return tracks.flatMap((t) => t.items.filter((i) => !i.parentId).map((i) => ({ id: i.id, name: i.name, startDate: i.startDate, dueDate: i.dueDate, track: t.name })));
}

// ---------- custom tag kinds (per project) ----------

export const listKinds = (db: Db | Tx, projectId: string) => db.select().from(scriptTagKinds).where(eq(scriptTagKinds.projectId, projectId)).orderBy(asc(scriptTagKinds.sortOrder), asc(scriptTagKinds.createdAt));
export type CustomKind = Awaited<ReturnType<typeof listKinds>>[number];
/** Built-ins followed by the project's custom kinds. */
export const getKinds = async (db: Db | Tx, projectId: string): Promise<KindDef[]> => withCustom(await listKinds(db, projectId));

/** How many scene tags of each custom key exist in the whole project. */
export async function kindUsage(db: Db | Tx, projectId: string): Promise<Record<string, number>> {
  const out: Record<string, number> = {};
  for (const r of await db.select({ t: scriptScenes.postTags }).from(scriptScenes).where(eq(scriptScenes.projectId, projectId))) for (const t of r.t) out[t.kind] = (out[t.kind] ?? 0) + 1;
  return out;
}

/** Trim, collapse whitespace, strip control characters. */
export const cleanLabel = (v: string) => v.replace(/[\u0000-\u001f\u007f-\u009f]/g, " ").replace(/\s+/g, " ").trim();

/** Stable key for a label: "c-" + ascii slug, made unique among `taken`. Always starts with "c-", so it never equals a built-in key. */
export function kindKey(label: string, taken: string[]): string {
  const slug = label.normalize("NFKD").replace(/[\u0300-\u036f]/g, "").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 30).replace(/-+$/, "") || "jenis";
  let key = `c-${slug}`;
  for (let n = 2; taken.includes(key); n++) key = `c-${slug}-${n}`;
  return key;
}

function checkLabel(raw: string, others: { label: string }[]) {
  const label = cleanLabel(raw);
  if (!label) throw new InputError("Nama jenis tag wajib diisi.");
  if (label.length > MAX_KIND_LABEL) throw new InputError(`Nama jenis tag maksimal ${MAX_KIND_LABEL} karakter.`);
  if ([...BUILTIN_KINDS, ...others].some((k) => k.label.toLowerCase() === label.toLowerCase())) throw new InputError("Sudah ada jenis tag dengan nama itu.");
  return label;
}
const checkColor = (c: number) => { if (!Number.isInteger(c) || c < 1 || c > 8) throw new InputError("Warna tidak valid."); return c; };

export async function createKind(db: Db, userId: string, projectId: string, input: { label: string; color: number }) {
  await requireRole(db, userId, projectId, "script.edit");
  const color = checkColor(input.color);
  return db.transaction(async (tx) => {
    const all = await listKinds(tx, projectId);
    if (all.length >= MAX_CUSTOM_KINDS) throw new InputError(`Maksimal ${MAX_CUSTOM_KINDS} jenis tag sendiri per project.`);
    const label = checkLabel(input.label, all);
    const key = kindKey(label, all.map((k) => k.key));
    const [row] = await tx.insert(scriptTagKinds).values({ projectId, key, label, color, sortOrder: Math.max(-1, ...all.map((k) => k.sortOrder)) + 1 }).returning();
    await record(tx, { projectId, userId, entity: "script_tag_kind", entityId: row.id, action: "create", summary: `Menambah jenis tag "${label}"`, after: { key, label, color } });
    return { id: row.id, key };
  });
}

export async function updateKind(db: Db, userId: string, projectId: string, id: string, patch: { label?: string; color?: number }) {
  await requireRole(db, userId, projectId, "script.edit");
  await db.transaction(async (tx) => {
    const all = await listKinds(tx, projectId);
    const row = all.find((k) => k.id === id);
    if (!row) throw new InputError("Jenis tag tidak ditemukan.");
    const next = { label: patch.label === undefined ? row.label : checkLabel(patch.label, all.filter((k) => k.id !== id)), color: patch.color === undefined ? row.color : checkColor(patch.color) };
    if (next.label === row.label && next.color === row.color) return;
    await tx.update(scriptTagKinds).set(next).where(eq(scriptTagKinds.id, id));
    await record(tx, { projectId, userId, entity: "script_tag_kind", entityId: id, action: "update", summary: `Jenis tag "${row.label}" diubah`, before: { label: row.label, color: row.color }, after: next });
  });
}

/** Swaps the kind with its neighbour. */
export async function moveKind(db: Db, userId: string, projectId: string, id: string, dir: -1 | 1) {
  await requireRole(db, userId, projectId, "script.edit");
  await db.transaction(async (tx) => {
    const all = await listKinds(tx, projectId);
    const i = all.findIndex((k) => k.id === id), j = i + dir;
    if (i < 0) throw new InputError("Jenis tag tidak ditemukan.");
    if (j < 0 || j >= all.length) return;
    const order = all.map((k) => k.id);
    [order[i], order[j]] = [order[j], order[i]];
    for (const [pos, kid] of order.entries()) await tx.update(scriptTagKinds).set({ sortOrder: pos }).where(eq(scriptTagKinds.id, kid));
    await record(tx, { projectId, userId, entity: "script_tag_kind", entityId: id, action: "update", summary: `Urutan jenis tag "${all[i].label}" diubah` });
  });
}

/** Deletes the kind and strips its tags from every scene of the project. One audit entry. Returns how many tags were removed. */
export async function deleteKind(db: Db, userId: string, projectId: string, id: string) {
  await requireRole(db, userId, projectId, "script.edit");
  return db.transaction(async (tx) => {
    const [row] = await tx.delete(scriptTagKinds).where(and(eq(scriptTagKinds.id, id), eq(scriptTagKinds.projectId, projectId))).returning();
    if (!row) throw new InputError("Jenis tag tidak ditemukan.");
    const scenes = await tx.select({ id: scriptScenes.id, postTags: scriptScenes.postTags }).from(scriptScenes).where(eq(scriptScenes.projectId, projectId));
    let removed = 0;
    for (const x of scenes.filter((y) => y.postTags.some((t) => t.kind === row.key))) {
      removed += x.postTags.filter((t) => t.kind === row.key).length;
      await tx.update(scriptScenes).set({ postTags: x.postTags.filter((t) => t.kind !== row.key) }).where(eq(scriptScenes.id, x.id));
    }
    await record(tx, { projectId, userId, entity: "script_tag_kind", entityId: id, action: "delete", summary: `Menghapus jenis tag "${row.label}"${removed ? ` dan ${removed} tag pada adegan` : ""}`, before: row });
    return { removed };
  });
}

/** A built-in key or a custom key of this project; anything else is rejected. Returns the display definition. */
async function resolveKind(tx: Db | Tx, projectId: string, k: string): Promise<KindDef> {
  if (isBuiltinKind(k)) return kindDef(BUILTIN_KINDS, k);
  const hit = (await getKinds(tx, projectId)).find((d) => d.key === k);
  if (!hit) throw new InputError("Jenis tag tidak valid.");
  return hit;
}

async function loadScenes(tx: Tx | Db, projectId: string, ids: string[]) {
  const rows = ids.length ? await tx.select().from(scriptScenes).where(and(inArray(scriptScenes.id, ids), eq(scriptScenes.projectId, projectId))) : [];
  if (!ids.length || rows.length !== new Set(ids).size) throw new InputError("Adegan tidak ditemukan.");
  return rows;
}

/**
 * Adds (or replaces) the tag of one kind on the given scenes, confirmed (auto: false). `itemId` undefined = default phase for the kind,
 * null = no phase, a string = that phase (must be a phase of this project). The auto keyword is kept.
 */
async function resolvePhase(db: Db, projectId: string, kind: string, want: string | null | undefined): Promise<string | null> {
  const phases = await listPhases(db, projectId);
  if (want === undefined) return defaultPhase(kind, phases);
  if (want === null || want === "") return null;
  if (phases.some((p) => p.id === want)) return want;
  throw new InputError("Fase tidak ditemukan.");
}

export async function setTags(db: Db, userId: string, projectId: string, sceneIds: string[], input: { kind: string; note?: string; itemId?: string | null }) {
  await requireRole(db, userId, projectId, "script.edit");
  const { key: kind, label } = await resolveKind(db, projectId, input.kind);
  const note = input.note === undefined ? undefined : pgSafe(input.note.trim().slice(0, 200)); // undefined keeps an existing note
  const itemId = await resolvePhase(db, projectId, kind, input.itemId);
  await db.transaction(async (tx) => {
    const rows = await loadScenes(tx, projectId, sceneIds);
    for (const r of rows) {
      const old = r.postTags.find((t) => t.kind === kind);
      const next: PostTag = { kind, note: note ?? old?.note ?? "", auto: false, itemId, ...(old?.keyword ? { keyword: old.keyword } : {}), ...(old?.excerpt ? { excerpt: old.excerpt } : {}) };
      await tx.update(scriptScenes).set({ postTags: [...r.postTags.filter((t) => t.kind !== kind), next] }).where(eq(scriptScenes.id, r.id));
    }
    const one = rows.length === 1;
    await record(tx, {
      projectId, userId, entity: one ? "script_scene" : "script", entityId: one ? rows[0].id : rows[0].scriptId, action: "update",
      summary: one ? `Adegan ${rows[0].number}: tag ${label} diatur` : `Tag ${label} ditambahkan ke ${rows.length} adegan`,
      after: { kind, note, itemId },
    });
  });
}

/** Confirms a parser suggestion (auto -> false) or removes a tag. */
async function changeTag(db: Db, userId: string, projectId: string, sceneId: string, kindIn: string, mode: "confirm" | "remove") {
  await requireRole(db, userId, projectId, "script.edit");
  const kind = kindIn; // no validation: a tag whose custom kind was deleted can still be removed
  await db.transaction(async (tx) => {
    const [row] = await loadScenes(tx, projectId, [sceneId]);
    const old = row.postTags.find((t) => t.kind === kind);
    if (!old) throw new InputError("Tag tidak ditemukan.");
    const next = mode === "remove" ? row.postTags.filter((t) => t.kind !== kind) : row.postTags.map((t) => (t.kind === kind ? { ...t, auto: false } : t));
    await tx.update(scriptScenes).set({ postTags: next }).where(eq(scriptScenes.id, sceneId));
    await record(tx, {
      projectId, userId, entity: "script_scene", entityId: sceneId, action: mode === "remove" ? "delete" : "update",
      summary: `Adegan ${row.number}: tag ${kindDef(await getKinds(tx, projectId), kind).label} ${mode === "remove" ? "dihapus" : "dikonfirmasi"}`, before: { kind, auto: old.auto, itemId: old.itemId ?? null },
    });
  });
}
export const confirmTag = (db: Db, userId: string, projectId: string, sceneId: string, kind: string) => changeTag(db, userId, projectId, sceneId, kind, "confirm");
export const removeTag = (db: Db, userId: string, projectId: string, sceneId: string, kind: string) => changeTag(db, userId, projectId, sceneId, kind, "remove");

/** Tag from a text selection in the reader: adds the selection to the scene's tag of that kind (excerpts are joined with " … "), confirmed. */
export async function addTagFromSelection(db: Db, userId: string, projectId: string, sceneId: string, kindIn: string, excerptIn: string, note = "", itemId?: string | null) {
  await requireRole(db, userId, projectId, "script.edit");
  const { key: kind, label } = await resolveKind(db, projectId, kindIn);
  const excerpt = pgSafe(excerptIn.replace(/\s+/g, " ").trim().slice(0, 500));
  if (!excerpt) throw new InputError("Pilih teks di naskah terlebih dahulu.");
  const phase = await resolvePhase(db, projectId, kind, itemId);
  await db.transaction(async (tx) => {
    const [row] = await loadScenes(tx, projectId, [sceneId]);
    const old = row.postTags.find((t) => t.kind === kind);
    const joined = old?.excerpt && !old.excerpt.includes(excerpt) ? pgSafe(`${old.excerpt} … ${excerpt}`.slice(0, 500)) : old?.excerpt?.includes(excerpt) ? old.excerpt : excerpt;
    const next: PostTag = { kind, note: pgSafe(note.trim().slice(0, 200)) || old?.note || "", auto: false, itemId: itemId === undefined && old?.itemId ? old.itemId : phase, excerpt: joined, ...(old?.keyword ? { keyword: old.keyword } : {}) };
    await tx.update(scriptScenes).set({ postTags: [...row.postTags.filter((t) => t.kind !== kind), next] }).where(eq(scriptScenes.id, sceneId));
    await record(tx, { projectId, userId, entity: "script_scene", entityId: sceneId, action: "update", summary: `Adegan ${row.number}: tag ${label} ditambahkan dari teks naskah`, after: { kind, itemId: phase } });
  });
}

// ---------- script text (members only; never sent to view-only or reviewer pages) ----------

/** The blocks of one scene, or null when the scene has no stored text (or is not in this project). */
export async function getSceneText(db: Db, projectId: string, sceneId: string): Promise<Block[] | null> {
  if (!/^[0-9a-f-]{36}$/i.test(sceneId)) return null;
  const [row] = await db.select({ blocks: scriptSceneText.blocks }).from(scriptSceneText).where(and(eq(scriptSceneText.sceneId, sceneId), eq(scriptSceneText.projectId, projectId)));
  return row?.blocks ?? null;
}

/** Blocks of several scenes of one script, keyed by scene id. Scenes without text are absent. */
export async function getScenesText(db: Db, projectId: string, scriptId: string, sceneIds: string[]): Promise<Record<string, Block[]>> {
  if (!sceneIds.length) return {};
  const rows = await db.select({ id: scriptSceneText.sceneId, blocks: scriptSceneText.blocks }).from(scriptSceneText)
    .innerJoin(scriptScenes, eq(scriptScenes.id, scriptSceneText.sceneId))
    .where(and(eq(scriptScenes.scriptId, scriptId), eq(scriptSceneText.projectId, projectId), inArray(scriptSceneText.sceneId, sceneIds)));
  return Object.fromEntries(rows.map((r) => [r.id, r.blocks]));
}

export type SearchHit = { sceneId: string; number: string; heading: string; matches: { block: number; pre: string; hit: string; post: string }[] };
const MAX_HITS = 200;

/** Case-insensitive substring search over the block text of a script, in script order. At most 200 matches in total. */
export async function searchScript(db: Db, projectId: string, scriptId: string, query: string): Promise<SearchHit[]> {
  const q = query.trim().toLowerCase();
  if (q.length < 2 || q.length > 100) return [];
  const rows = await db.select({ id: scriptScenes.id, number: scriptScenes.number, heading: scriptScenes.heading, blocks: scriptSceneText.blocks }).from(scriptSceneText)
    .innerJoin(scriptScenes, eq(scriptScenes.id, scriptSceneText.sceneId))
    .where(and(eq(scriptScenes.scriptId, scriptId), eq(scriptSceneText.projectId, projectId))).orderBy(asc(scriptScenes.position));
  const out: SearchHit[] = [];
  let total = 0;
  for (const r of rows) {
    const matches: SearchHit["matches"] = [];
    r.blocks.forEach((b, block) => {
      const low = b.text.toLowerCase();
      for (let at = low.indexOf(q); at >= 0 && total < MAX_HITS; at = low.indexOf(q, at + q.length)) {
        total++;
        matches.push({ block, pre: (at > 50 ? "…" : "") + b.text.slice(Math.max(0, at - 50), at), hit: b.text.slice(at, at + q.length), post: b.text.slice(at + q.length, at + q.length + 70) + (at + q.length + 70 < b.text.length ? "…" : "") });
      }
    });
    if (matches.length) out.push({ sceneId: r.id, number: r.number, heading: r.heading, matches });
    if (total >= MAX_HITS) break;
  }
  return out;
}

/** Supervisor: deletes the stored text of a script and the excerpts on its tags. Scenes, structure and tags stay. */
export async function purgeScriptText(db: Db, userId: string, projectId: string, scriptId: string) {
  await requireRole(db, userId, projectId, "script.edit");
  await db.transaction(async (tx) => {
    const [script] = await tx.select().from(scripts).where(and(eq(scripts.id, scriptId), eq(scripts.projectId, projectId)));
    if (!script) throw new InputError("Naskah tidak ditemukan.");
    const scenes = await tx.select({ id: scriptScenes.id, postTags: scriptScenes.postTags }).from(scriptScenes).where(eq(scriptScenes.scriptId, scriptId));
    const ids = scenes.map((x) => x.id);
    const gone = ids.length ? await tx.delete(scriptSceneText).where(and(inArray(scriptSceneText.sceneId, ids), eq(scriptSceneText.projectId, projectId))).returning({ id: scriptSceneText.sceneId }) : [];
    for (const x of scenes.filter((y) => y.postTags.some((t) => t.excerpt))) {
      await tx.update(scriptScenes).set({ postTags: x.postTags.map((t) => omit(t, "excerpt")) }).where(eq(scriptScenes.id, x.id));
    }
    await record(tx, { projectId, userId, entity: "script", entityId: scriptId, action: "update", summary: `Menghapus teks naskah "${script.title}" (${gone.length} adegan); struktur dan tag tetap` });
  });
}

/** For the timeline drawer: the latest script's tags grouped by linked phase. Null when the project has no script. */
export async function getPhaseNeeds(db: Db, projectId: string) {
  const [script] = await db.select({ id: scripts.id }).from(scripts).where(eq(scripts.projectId, projectId)).orderBy(desc(scripts.createdAt)).limit(1);
  if (!script) return null;
  const scenes = await db.select({ id: scriptScenes.id, heading: scriptScenes.heading, number: scriptScenes.number, estSeconds: scriptScenes.estSeconds, postTags: scriptScenes.postTags }).from(scriptScenes).where(eq(scriptScenes.scriptId, script.id)).orderBy(asc(scriptScenes.position));
  return { scriptId: script.id, byPhase: needsByPhase(scenes as { id: string; heading: string; number: string; estSeconds: number; postTags: PostTag[] }[], await getKinds(db, projectId)) };
}
