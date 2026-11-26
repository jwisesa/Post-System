import { and, asc, desc, eq, sql } from "drizzle-orm";
import { z } from "zod";
import type { Db } from "@/db/client";
import { framingCharts } from "@/db/schema";
import { InputError, pgSafe, record, requireRole } from "../services";
import { DEFAULTS, parseState } from "./frame";

export const MAX_CHARTS = 50;
const KEYS = new Set(Object.keys(DEFAULTS));
const uuid = z.string().uuid();
/** Untrusted state: a flat string map with only known keys, at most 4 KB serialised. */
const stateSchema = z.record(z.string(), z.string()).refine((o) => Object.keys(o).every((k) => KEYS.has(k)), "kunci tidak dikenal").refine((o) => JSON.stringify(o).length <= 4096, "terlalu besar");

/** Validates and normalises to a full State minus `project` (the project name always comes from the project itself). */
export function cleanState(input: unknown): Record<string, string> {
  const r = stateSchema.safeParse(input);
  if (!r.success) throw new InputError("Data chart tidak valid.");
  const st: Record<string, string> = { ...parseState(r.data) };
  delete st.project;
  return st;
}
const cleanName = (n: unknown) => {
  const v = pgSafe(String(n ?? "")).replace(/\s+/g, " ").trim().slice(0, 80);
  if (!v) throw new InputError("Nama chart wajib diisi.");
  return v;
};
const cleanId = (id: unknown) => { if (!uuid.safeParse(id).success) throw new InputError("Chart tidak ditemukan."); return String(id); };
const isDup = (e: unknown) => (e as { code?: string; cause?: { code?: string } })?.code === "23505" || (e as { cause?: { code?: string } })?.cause?.code === "23505";
const dup = (name: string) => new InputError(`Sudah ada chart bernama "${name}". Pakai nama lain.`);

export type SavedChart = { id: string; name: string; state: Record<string, string>; updatedAt: Date };
export async function listCharts(db: Db, projectId: string): Promise<SavedChart[]> {
  return db.select({ id: framingCharts.id, name: framingCharts.name, state: framingCharts.state, updatedAt: framingCharts.updatedAt }).from(framingCharts).where(eq(framingCharts.projectId, projectId)).orderBy(desc(framingCharts.updatedAt), asc(framingCharts.name));
}
/** Project-scoped: another project's chart id looks the same as a missing one. */
export async function getChart(db: Db, projectId: string, id: string): Promise<SavedChart | null> {
  if (!uuid.safeParse(id).success) return null;
  const [r] = await db.select({ id: framingCharts.id, name: framingCharts.name, state: framingCharts.state, updatedAt: framingCharts.updatedAt }).from(framingCharts).where(and(eq(framingCharts.id, id), eq(framingCharts.projectId, projectId)));
  return r ?? null;
}

async function insert(db: Db, userId: string, projectId: string, name: string, state: Record<string, string>, verb: string) {
  try {
    return await db.transaction(async (tx) => {
      const [{ n }] = await tx.select({ n: sql<number>`count(*)::int` }).from(framingCharts).where(eq(framingCharts.projectId, projectId));
      if (n >= MAX_CHARTS) throw new InputError(`Maksimal ${MAX_CHARTS} chart tersimpan per project. Hapus yang tidak dipakai.`);
      const [row] = await tx.insert(framingCharts).values({ projectId, name, state, createdBy: userId }).returning({ id: framingCharts.id });
      await record(tx, { projectId, userId, entity: "framing_chart", entityId: row.id, action: "create", summary: `${verb} framing chart "${name}"` });
      return row.id;
    });
  } catch (e) { if (isDup(e)) throw dup(name); throw e; }
}

/** id given: overwrite that chart's state (and name if `name` is given); otherwise create a new chart. */
export async function saveChart(db: Db, userId: string, projectId: string, input: { id?: string | null; name?: string; state: unknown }): Promise<{ id: string }> {
  await requireRole(db, userId, projectId, "framing.edit");
  const state = cleanState(input.state);
  if (!input.id) return { id: await insert(db, userId, projectId, cleanName(input.name), state, "Menyimpan") };
  const id = cleanId(input.id);
  try {
    await db.transaction(async (tx) => {
      const [cur] = await tx.select({ name: framingCharts.name }).from(framingCharts).where(and(eq(framingCharts.id, id), eq(framingCharts.projectId, projectId)));
      if (!cur) throw new InputError("Chart tidak ditemukan.");
      const name = input.name == null ? cur.name : cleanName(input.name);
      await tx.update(framingCharts).set({ name, state, updatedAt: new Date() }).where(eq(framingCharts.id, id));
      await record(tx, { projectId, userId, entity: "framing_chart", entityId: id, action: "update", summary: `Memperbarui framing chart "${name}"` });
    });
  } catch (e) { if (isDup(e)) throw dup(cleanName(input.name)); throw e; }
  return { id };
}

export async function renameChart(db: Db, userId: string, projectId: string, id: string, name: string) {
  await requireRole(db, userId, projectId, "framing.edit");
  id = cleanId(id); const next = cleanName(name);
  try {
    await db.transaction(async (tx) => {
      const [cur] = await tx.select({ name: framingCharts.name }).from(framingCharts).where(and(eq(framingCharts.id, id), eq(framingCharts.projectId, projectId)));
      if (!cur) throw new InputError("Chart tidak ditemukan.");
      await tx.update(framingCharts).set({ name: next, updatedAt: new Date() }).where(eq(framingCharts.id, id));
      await record(tx, { projectId, userId, entity: "framing_chart", entityId: id, action: "update", summary: `Mengganti nama framing chart "${cur.name}" menjadi "${next}"` });
    });
  } catch (e) { if (isDup(e)) throw dup(next); throw e; }
}

export async function deleteChart(db: Db, userId: string, projectId: string, id: string) {
  await requireRole(db, userId, projectId, "framing.edit");
  id = cleanId(id);
  await db.transaction(async (tx) => {
    const [cur] = await tx.delete(framingCharts).where(and(eq(framingCharts.id, id), eq(framingCharts.projectId, projectId))).returning({ name: framingCharts.name });
    if (!cur) throw new InputError("Chart tidak ditemukan.");
    await record(tx, { projectId, userId, entity: "framing_chart", entityId: id, action: "delete", summary: `Menghapus framing chart "${cur.name}"` });
  });
}

/** Copies a chart as "<name> (salinan)", then "(salinan 2)"... within the 80 char cap. */
export async function duplicateChart(db: Db, userId: string, projectId: string, id: string): Promise<{ id: string }> {
  await requireRole(db, userId, projectId, "framing.edit");
  const src = await getChart(db, projectId, cleanId(id));
  if (!src) throw new InputError("Chart tidak ditemukan.");
  const taken = new Set((await listCharts(db, projectId)).map((c) => c.name.toLowerCase()));
  const base = src.name.slice(0, 66);
  let name = `${base} (salinan)`;
  for (let n = 2; taken.has(name.toLowerCase()); n++) name = `${base} (salinan ${n})`;
  return { id: await insert(db, userId, projectId, name, src.state, "Menduplikasi") };
}
