// Hard drive planning: calculator inputs (on the scenario), shopping list (drive lines) and per-project data-rate edits.
// Reads need "budget.view", writes "budget.edit" plus an audit row in the same transaction. Audit summaries carry no amounts.
import { and, asc, eq, max } from "drizzle-orm";
import { z } from "zod";
import type { Db } from "@/db/client";
import { budgetDriveLines, budgetScenarios, budgetScopes, budgetSettings, budgetVendors, projects } from "@/db/schema";
import { canUseDriveTracker, getDriveSummary } from "../drive-tracker/service";
import { getTechSpec, InputError, record, requireRole, type Tx } from "../services";
import { calcSchema, compareTracker, computeNeed, seedCalc, type DriveCalc } from "./capacity";
import { mergeRates, RATES, type RateRow } from "./datarates";
import { MAX_RP } from "./money";
import { ensureActiveScenario } from "./service";

const isUuid = (s: string) => /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(s);
const fail = (r: { error: z.ZodError }): never => { throw new InputError(r.error.issues[0]?.message || "Data tidak valid."); };

export const PURPOSES = { ocf: "OCF", proxy: "Proxy", grade: "Grading", vfx: "VFX", master: "Master", archive: "Arsip", other: "Lainnya" } as const;
export const MEDIA = { ssd: "SSD", hdd: "HDD", raid: "RAID", lto: "LTO", other: "Lainnya" } as const;
export const DRIVE_STATUS = { planned: "Rencana", ordered: "Dipesan", received: "Diterima", cancelled: "Batal" } as const;

const rateSchema = z.array(z.object({
  id: z.string().min(1).max(60), maker: z.string().trim().max(60), label: z.string().trim().min(1, "Nama baris wajib diisi.").max(120),
  models: z.array(z.string().trim().max(80)).max(20), formats: z.array(z.string().trim().max(80)).max(20), res: z.array(z.string().trim().max(80)).max(20),
  refFps: z.number().min(1).max(240), mbps: z.number().min(0).max(100000), source: z.null(), note: z.string().max(300).optional(),
})).max(100);

async function projectRates(db: Db, projectId: string): Promise<RateRow[]> {
  const [s] = await db.select().from(budgetSettings).where(eq(budgetSettings.projectId, projectId));
  const p = rateSchema.safeParse(s?.rates ?? []);
  return p.success ? (p.data as RateRow[]) : [];
}

/** The scenario to work on: the given one (must belong to the project) or the active one (created on first use). */
async function pickScenario(tx: Tx, projectId: string, scenarioId?: string | null): Promise<string> {
  if (!scenarioId) return ensureActiveScenario(tx, projectId);
  const [s] = isUuid(scenarioId) ? await tx.select({ id: budgetScenarios.id }).from(budgetScenarios).where(and(eq(budgetScenarios.id, scenarioId), eq(budgetScenarios.projectId, projectId))) : [];
  if (!s) throw new InputError("Rencana tidak ditemukan.");
  return s.id;
}

export async function getDrivePlan(db: Db, userId: string, projectId: string, opts: { email?: string; scenarioId?: string | null } = {}) {
  await requireRole(db, userId, projectId, "budget.view");
  const [scenario] = await db.select().from(budgetScenarios).where(opts.scenarioId && isUuid(opts.scenarioId) ? and(eq(budgetScenarios.projectId, projectId), eq(budgetScenarios.id, opts.scenarioId)) : and(eq(budgetScenarios.projectId, projectId), eq(budgetScenarios.isActive, true)));
  if (opts.scenarioId && !scenario) throw new InputError("Rencana tidak ditemukan.");
  const [own, tech, scopes] = [await projectRates(db, projectId), await getTechSpec(db, projectId), await db.select().from(budgetScopes).where(eq(budgetScopes.projectId, projectId)).orderBy(asc(budgetScopes.sortOrder), asc(budgetScopes.createdAt))];
  const rates = mergeRates(RATES, own);
  const saved = scenario?.driveCalc ? calcSchema.safeParse(scenario.driveCalc) : null;
  const calc: DriveCalc = saved?.success ? (saved.data as DriveCalc) : seedCalc(tech as Record<string, string>, rates);
  const lines = scenario ? await db.select({ l: budgetDriveLines, vendor: budgetVendors.name }).from(budgetDriveLines).leftJoin(budgetVendors, eq(budgetVendors.id, budgetDriveLines.vendorId)).where(eq(budgetDriveLines.scenarioId, scenario.id)).orderBy(asc(budgetDriveLines.sortOrder), asc(budgetDriveLines.createdAt)) : [];
  const need = computeNeed(calc, rates);
  let tracker = null, compare = null;
  if (opts.email && canUseDriveTracker(opts.email)) {
    const [p] = await db.select({ id: projects.driveTrackerProjectId }).from(projects).where(eq(projects.id, projectId));
    if (p?.id) { tracker = await getDriveSummary(db, p.id); compare = compareTracker(need, lines.map((x) => x.l), tracker); }
  }
  return {
    scenarioId: scenario?.id ?? null, scenarioName: scenario?.name ?? null, isActive: scenario?.isActive ?? true, seeded: !saved?.success, calc, tech: tech as Record<string, string>, rates, projectRateIds: own.map((r) => r.id), need, tracker, compare,
    scopeId: scopes.find((s) => s.category === "drives")?.id ?? null,
    lines: lines.map((x) => ({ ...x.l, vendor: x.vendor })),
  };
}
export type DrivePlan = Awaited<ReturnType<typeof getDrivePlan>>;

export async function saveDriveCalc(db: Db, userId: string, projectId: string, input: unknown, scenarioId?: string | null) {
  await requireRole(db, userId, projectId, "budget.edit");
  const p = calcSchema.safeParse(input);
  if (!p.success) return fail(p);
  await db.transaction(async (tx) => {
    const sid = await pickScenario(tx, projectId, scenarioId);
    await tx.update(budgetScenarios).set({ driveCalc: p.data }).where(eq(budgetScenarios.id, sid));
    await record(tx, { projectId, userId, entity: "budget_scenario", entityId: sid, action: "update", summary: "Menyimpan kalkulator hard drive" });
  });
}

/** Replaces the saved calculation with a fresh one read from the Technical Page. */
export async function reseedDriveCalc(db: Db, userId: string, projectId: string, scenarioId?: string | null) {
  await requireRole(db, userId, projectId, "budget.edit");
  const calc = seedCalc((await getTechSpec(db, projectId)) as Record<string, string>, mergeRates(RATES, await projectRates(db, projectId)));
  await saveDriveCalc(db, userId, projectId, calc, scenarioId);
}

export async function saveRates(db: Db, userId: string, projectId: string, rows: unknown) {
  await requireRole(db, userId, projectId, "budget.edit");
  const p = rateSchema.safeParse(rows);
  if (!p.success) return fail(p);
  const builtIn = new Set(RATES.map((r) => r.id));
  const seen = new Set<string>();
  for (const r of p.data) {
    if (!r.id.startsWith("p-") && !builtIn.has(r.id)) throw new InputError("ID baris tidak valid.");
    if (seen.has(r.id)) throw new InputError("ID baris ganda.");
    seen.add(r.id);
    if (!(r.mbps > 0)) throw new InputError("Mbit/s harus lebih dari 0.");
  }
  await db.transaction(async (tx) => {
    await tx.insert(budgetSettings).values({ projectId, rates: p.data }).onConflictDoUpdate({ target: budgetSettings.projectId, set: { rates: p.data, updatedAt: new Date() } });
    await record(tx, { projectId, userId, entity: "budget_scenario", entityId: projectId, action: "update", summary: "Mengubah tabel data rate proyek" });
  });
}

export type DriveLineInput = { brand?: string; model?: string; purpose: string; media: string; capacityGb: number; qty: number; unitPrice: number; ppnBp: number | null; vendorId: string | null; neededBy: string; status: string; notes: string };
const LineSchema = z.object({
  brand: z.string().max(60).transform((s) => s.trim()).default(""),
  model: z.string().max(80).transform((s) => s.trim()).default(""),
  purpose: z.enum(["ocf", "proxy", "grade", "vfx", "master", "archive", "other"]),
  media: z.enum(["ssd", "hdd", "raid", "lto", "other"]),
  capacityGb: z.number({ message: "Kapasitas wajib diisi." }).int().min(1, "Kapasitas wajib diisi.").max(10_000_000),
  qty: z.number().int().min(1, "Jumlah minimal 1.").max(10000),
  unitPrice: z.number().int().min(0, "Harga tidak boleh negatif.").max(MAX_RP),
  ppnBp: z.number().int().min(0).max(10000).nullable(),
  vendorId: z.string().nullable(),
  neededBy: z.string().refine((s) => s === "" || (/^\d{4}-\d{2}-\d{2}$/.test(s) && !Number.isNaN(Date.parse(s))), "Tanggal tidak valid."),
  status: z.enum(["planned", "ordered", "received", "cancelled"]),
  notes: z.string().max(500).transform((s) => s.trim()),
}).refine((l) => BigInt(l.qty) * BigInt(l.unitPrice) <= BigInt(MAX_RP), "Jumlah terlalu besar.");

async function checkLine(tx: Pick<Db, "select">, projectId: string, input: DriveLineInput) {
  const p = LineSchema.safeParse(input);
  if (!p.success) return fail(p);
  const d = p.data;
  if (d.vendorId) {
    const [v] = isUuid(d.vendorId) ? await tx.select({ id: budgetVendors.id }).from(budgetVendors).where(and(eq(budgetVendors.id, d.vendorId), eq(budgetVendors.projectId, projectId))) : [];
    if (!v) throw new InputError("Vendor tidak ditemukan.");
  }
  const { ppnBp, ...rest } = d;
  return { ...rest, ppnRateBp: ppnBp, neededBy: d.neededBy || null };
}

export async function addDriveLine(db: Db, userId: string, projectId: string, input: DriveLineInput, scenarioId?: string | null) {
  await requireRole(db, userId, projectId, "budget.edit");
  return db.transaction(async (tx) => {
    const d = await checkLine(tx, projectId, input);
    const sid = await pickScenario(tx, projectId, scenarioId);
    await tx.select({ id: projects.id }).from(projects).where(eq(projects.id, projectId)).for("update"); // serialise the find-or-create of the drives scope
    const [have] = await tx.select({ id: budgetScopes.id }).from(budgetScopes).where(and(eq(budgetScopes.projectId, projectId), eq(budgetScopes.category, "drives"))).orderBy(asc(budgetScopes.sortOrder), asc(budgetScopes.createdAt)).limit(1);
    let scopeId = have?.id;
    if (!scopeId) {
      const [m] = await tx.select({ n: max(budgetScopes.sortOrder) }).from(budgetScopes).where(eq(budgetScopes.projectId, projectId));
      const [s] = await tx.insert(budgetScopes).values({ projectId, name: "Hard drive & storage", category: "drives", sortOrder: (m?.n ?? 0) + 1 }).returning();
      scopeId = s.id;
      await record(tx, { projectId, userId, entity: "budget_scope", entityId: s.id, action: "create", summary: `Menambah lingkup "${s.name}" (otomatis dari belanja drive)` });
    }
    const [row] = await tx.insert(budgetDriveLines).values({ ...d, projectId, scenarioId: sid, scopeId }).returning();
    await record(tx, { projectId, userId, entity: "budget_scope", entityId: scopeId, action: "create", summary: `Menambah belanja drive (${PURPOSES[d.purpose]})`, after: row });
    return { lineId: row.id };
  });
}

export async function updateDriveLine(db: Db, userId: string, projectId: string, lineId: string, input: DriveLineInput) {
  await requireRole(db, userId, projectId, "budget.edit");
  await db.transaction(async (tx) => {
    const [old] = isUuid(lineId) ? await tx.select().from(budgetDriveLines).where(and(eq(budgetDriveLines.id, lineId), eq(budgetDriveLines.projectId, projectId))) : [];
    if (!old) throw new InputError("Baris belanja tidak ditemukan.");
    const d = await checkLine(tx, projectId, input);
    const keys = (Object.keys(d) as (keyof typeof d)[]).filter((k) => JSON.stringify(d[k]) !== JSON.stringify(old[k]));
    if (!keys.length) return;
    await tx.update(budgetDriveLines).set(d).where(eq(budgetDriveLines.id, lineId));
    await record(tx, { projectId, userId, entity: "budget_scope", entityId: old.scopeId, action: "update", summary: `Belanja drive (${PURPOSES[d.purpose]}): ${keys.join(", ")} diubah`, before: Object.fromEntries(keys.map((k) => [k, old[k]])), after: Object.fromEntries(keys.map((k) => [k, d[k]])) });
  });
}

export async function deleteDriveLine(db: Db, userId: string, projectId: string, lineId: string) {
  await requireRole(db, userId, projectId, "budget.edit");
  await db.transaction(async (tx) => {
    const [old] = isUuid(lineId) ? await tx.select().from(budgetDriveLines).where(and(eq(budgetDriveLines.id, lineId), eq(budgetDriveLines.projectId, projectId))) : [];
    if (!old) throw new InputError("Baris belanja tidak ditemukan.");
    await tx.delete(budgetDriveLines).where(eq(budgetDriveLines.id, lineId));
    await record(tx, { projectId, userId, entity: "budget_scope", entityId: old.scopeId, action: "delete", summary: `Menghapus belanja drive (${PURPOSES[old.purpose]})`, before: old });
  });
}
