// Scenarios ("Rencana A/B"): which bid and which quote version is picked per scope, plus the hard-drive plan.
// Exactly one scenario is active (partial unique index); the active one feeds the Ringkasan. Invoices and payments are
// live data shared by every scenario. Reads need "budget.view", writes "budget.edit" + an audit row in the same
// transaction; audit summaries never carry amounts.
import { and, eq } from "drizzle-orm";
import { z } from "zod";
import type { Db } from "@/db/client";
import { budgetBids, budgetDocs, budgetDriveLines, budgetPicks, budgetScenarios, budgetScopes, budgetVendors, budgetVersions } from "@/db/schema";
import { InputError, record, requireRole } from "../services";
import { bidValue, rollup } from "./rollup";
import { ensureActiveScenario, getBudget, type BudgetData } from "./service";

const isUuid = (s: string) => /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(s);
const nameSchema = z.string().trim().min(1, "Nama rencana wajib diisi.").max(80, "Nama rencana maksimal 80 karakter.");
const parseName = (s: string) => { const p = nameSchema.safeParse(s); if (!p.success) throw new InputError(p.error.issues[0].message); return p.data; };

/** Locks every scenario of the project (serialises activation/deletion) and returns them. */
const lockAll = (tx: Parameters<Parameters<Db["transaction"]>[0]>[0], projectId: string) => tx.select().from(budgetScenarios).where(eq(budgetScenarios.projectId, projectId)).orderBy(budgetScenarios.id).for("update");

export async function createScenario(db: Db, userId: string, projectId: string, name: string, copyFromId?: string | null) {
  await requireRole(db, userId, projectId, "budget.edit");
  const n = parseName(name);
  return db.transaction(async (tx) => {
    await ensureActiveScenario(tx, projectId);
    const all = await lockAll(tx, projectId);
    if (all.some((s) => s.name === n)) throw new InputError("Nama rencana sudah dipakai.");
    const src = copyFromId ? all.find((s) => s.id === copyFromId) : null;
    if (copyFromId && !src) throw new InputError("Rencana asal tidak ditemukan.");
    const [row] = await tx.insert(budgetScenarios).values({ projectId, name: n, driveCalc: src?.driveCalc ? structuredClone(src.driveCalc) : null, createdBy: userId }).returning();
    if (src) {
      const picks = await tx.select().from(budgetPicks).where(eq(budgetPicks.scenarioId, src.id));
      if (picks.length) await tx.insert(budgetPicks).values(picks.map((p) => ({ ...p, scenarioId: row.id })));
      const lines = await tx.select().from(budgetDriveLines).where(eq(budgetDriveLines.scenarioId, src.id));
      if (lines.length) await tx.insert(budgetDriveLines).values(lines.map((l) => ({ ...l, id: undefined, createdAt: undefined, scenarioId: row.id })));
    }
    await record(tx, { projectId, userId, entity: "budget_scenario", entityId: row.id, action: "create", summary: src ? `Menyalin rencana "${src.name}" menjadi "${n}"` : `Membuat rencana kosong "${n}"` });
    return { scenarioId: row.id };
  });
}

export async function renameScenario(db: Db, userId: string, projectId: string, scenarioId: string, name: string, notes?: string) {
  await requireRole(db, userId, projectId, "budget.edit");
  const n = parseName(name);
  const note = notes === undefined ? undefined : notes.trim().slice(0, 500);
  await db.transaction(async (tx) => {
    const all = await lockAll(tx, projectId);
    const cur = all.find((s) => s.id === scenarioId);
    if (!cur) throw new InputError("Rencana tidak ditemukan.");
    if (all.some((s) => s.id !== scenarioId && s.name === n)) throw new InputError("Nama rencana sudah dipakai.");
    if (n === cur.name && (note === undefined || note === cur.notes)) return;
    await tx.update(budgetScenarios).set({ name: n, ...(note === undefined ? {} : { notes: note }) }).where(eq(budgetScenarios.id, scenarioId));
    await record(tx, { projectId, userId, entity: "budget_scenario", entityId: scenarioId, action: "update", summary: n === cur.name ? `Mengubah catatan rencana "${n}"` : `Mengganti nama rencana "${cur.name}" menjadi "${n}"` });
  });
}

export async function deleteScenario(db: Db, userId: string, projectId: string, scenarioId: string) {
  await requireRole(db, userId, projectId, "budget.edit");
  await db.transaction(async (tx) => {
    const cur = (await lockAll(tx, projectId)).find((s) => s.id === scenarioId);
    if (!cur) throw new InputError("Rencana tidak ditemukan.");
    if (cur.isActive) throw new InputError("Rencana aktif tidak bisa dihapus. Aktifkan rencana lain dulu.");
    await tx.delete(budgetScenarios).where(eq(budgetScenarios.id, scenarioId)); // picks and drive lines cascade
    await record(tx, { projectId, userId, entity: "budget_scenario", entityId: scenarioId, action: "delete", summary: `Menghapus rencana "${cur.name}"`, before: { name: cur.name } });
  });
}

export async function activateScenario(db: Db, userId: string, projectId: string, scenarioId: string) {
  await requireRole(db, userId, projectId, "budget.edit");
  await db.transaction(async (tx) => {
    const all = await lockAll(tx, projectId);
    const cur = all.find((s) => s.id === scenarioId);
    if (!cur) throw new InputError("Rencana tidak ditemukan.");
    if (cur.isActive) return;
    const old = all.find((s) => s.isActive);
    await tx.update(budgetScenarios).set({ isActive: false }).where(and(eq(budgetScenarios.projectId, projectId), eq(budgetScenarios.isActive, true))); // old first: partial unique index
    await tx.update(budgetScenarios).set({ isActive: true }).where(eq(budgetScenarios.id, scenarioId));
    await record(tx, { projectId, userId, entity: "budget_scenario", entityId: scenarioId, action: "update", summary: old ? `Mengaktifkan rencana "${cur.name}" (menggantikan "${old.name}")` : `Mengaktifkan rencana "${cur.name}"` });
  });
}

/** Chooses the bid for a scope in ANY scenario. versionId null follows the live approval; a version id pins that quote version. bidId null clears. */
export async function pickInScenario(db: Db, userId: string, projectId: string, scenarioId: string, scopeId: string, bidId: string | null, versionId: string | null) {
  await requireRole(db, userId, projectId, "budget.edit");
  await db.transaction(async (tx) => {
    const [sc] = isUuid(scenarioId) ? await tx.select().from(budgetScenarios).where(and(eq(budgetScenarios.id, scenarioId), eq(budgetScenarios.projectId, projectId))).for("update") : [];
    if (!sc) throw new InputError("Rencana tidak ditemukan.");
    const [scope] = isUuid(scopeId) ? await tx.select().from(budgetScopes).where(and(eq(budgetScopes.id, scopeId), eq(budgetScopes.projectId, projectId))) : [];
    if (!scope) throw new InputError("Lingkup tidak ditemukan.");
    if (!bidId) {
      await tx.delete(budgetPicks).where(and(eq(budgetPicks.scenarioId, scenarioId), eq(budgetPicks.scopeId, scopeId)));
      await record(tx, { projectId, userId, entity: "budget_scenario", entityId: scenarioId, action: "update", summary: `Rencana "${sc.name}": pilihan vendor untuk lingkup "${scope.name}" dibatalkan` });
      return;
    }
    const [b] = isUuid(bidId) ? await tx.select({ scopeId: budgetBids.scopeId, vendor: budgetVendors.name }).from(budgetBids).innerJoin(budgetVendors, eq(budgetVendors.id, budgetBids.vendorId)).where(and(eq(budgetBids.id, bidId), eq(budgetBids.projectId, projectId))) : [];
    if (!b || b.scopeId !== scopeId) throw new InputError("Vendor itu bukan bagian dari lingkup ini.");
    let no = 0;
    if (versionId) {
      const [v] = isUuid(versionId) ? await tx.select({ number: budgetVersions.number }).from(budgetVersions).innerJoin(budgetDocs, eq(budgetDocs.id, budgetVersions.docId)).where(and(eq(budgetVersions.id, versionId), eq(budgetDocs.bidId, bidId), eq(budgetDocs.kind, "quote"))) : [];
      if (!v) throw new InputError("Versi itu bukan bagian dari penawaran vendor ini.");
      no = v.number;
    }
    await tx.insert(budgetPicks).values({ scenarioId, scopeId, bidId, versionId, projectId }).onConflictDoUpdate({ target: [budgetPicks.scenarioId, budgetPicks.scopeId], set: { bidId, versionId } });
    await record(tx, { projectId, userId, entity: "budget_scenario", entityId: scenarioId, action: "update", summary: `Rencana "${sc.name}": memilih "${b.vendor}" untuk lingkup "${scope.name}" (${versionId ? `versi ${no} dikunci` : "mengikuti persetujuan"})`, after: { scopeId, bidId, versionId } });
  });
}

// ---------- comparison ----------

export type PickCell = {
  bidId: string | null; versionId: string | null; vendor: string | null;
  mode: "pinned" | "approved" | "provisional" | "none"; label: string; amount: number; stale: boolean;
};
export type ScenarioView = {
  id: string; name: string; isActive: boolean; cells: Record<string, PickCell>; drives: number;
  total: { budget: number; chosen: number; invoiced: number; paid: number; provisional: boolean }; vsBudget: number; diffFirst: number;
};

/** Pure: runs the rollup once per scenario over the same live rows. Vendor part of a scope excludes its drive lines (shown in the "Hard drive" row). */
export function buildComparison(data: BudgetData, ids: string[]) {
  const scopes = data.scopes.filter((s) => s.category !== "drives" || data.bids.some((b) => b.scopeId === s.id));
  const views: ScenarioView[] = ids.flatMap((id) => {
    const sc = data.scenarios.find((s) => s.id === id);
    if (!sc) return [];
    const picks = data.allPicks.filter((p) => p.scenarioId === id);
    const lines = data.allDriveLines.filter((l) => l.scenarioId === id);
    const rows = { scopes: data.scopes, bids: data.bids, docs: data.docs, versions: data.versions, picks, invoices: data.invoices, payments: data.payments, driveLines: lines };
    const r = rollup(rows);
    const cells: Record<string, PickCell> = {};
    for (const s of scopes) {
      const row = r.rows.find((x) => x.scopeId === s.id)!;
      const pk = picks.find((p) => p.scopeId === s.id);
      const bid = pk && data.bids.find((b) => b.id === pk.bidId);
      const vendor = bid ? data.vendors.find((v) => v.id === bid.vendorId)?.name ?? null : null;
      const bv = pk ? bidValue(pk.bidId, rows, pk.versionId) : null;
      const pickedV = pk?.versionId ? data.versions.find((v) => v.id === pk.versionId) : undefined;
      const shown = bv?.versionId ? data.versions.find((v) => v.id === bv.versionId) : undefined;
      const mode = bv?.state ?? "none";
      const no = shown ? `v${shown.number}` : "";
      cells[s.id] = {
        bidId: pk?.bidId ?? null, versionId: pk?.versionId ?? null, vendor, mode,
        label: !pk ? "" : mode === "pinned" ? `${no} (dikunci)` : mode === "approved" ? `${no} (mengikuti persetujuan)` : mode === "provisional" ? `${no} (perkiraan)` : "belum ada versi",
        amount: row.chosen - row.drives, stale: !!pickedV && (pickedV.status === "rejected" || pickedV.status === "superseded"),
      };
    }
    const drives = r.rows.reduce((n, x) => n + x.drives, 0);
    return [{ id, name: sc.name, isActive: sc.isActive, cells, drives, total: { budget: r.total.budget, chosen: r.total.chosen, invoiced: r.total.invoiced, paid: r.total.paid, provisional: r.total.provisional }, vsBudget: r.total.budget - r.total.chosen, diffFirst: 0 }];
  });
  for (const v of views) v.diffFirst = v.total.chosen - (views[0]?.total.chosen ?? 0);
  return {
    scopes: scopes.map((s) => ({ id: s.id, name: s.name, category: s.category, budget: s.budget })),
    scenarios: views,
    live: { invoiced: views[0]?.total.invoiced ?? 0, paid: views[0]?.total.paid ?? 0 }, // identical in every scenario
  };
}
export type Comparison = ReturnType<typeof buildComparison>;

/** 2 to 4 scenarios side by side, in the order given (differences are against the first). */
export async function getScenarioComparison(db: Db, userId: string, projectId: string, ids: string[]) {
  const data = await getBudget(db, userId, projectId); // requires budget.view
  const uniq = [...new Set(ids)];
  if (uniq.length < 2 || uniq.length > 4) throw new InputError("Pilih 2 sampai 4 rencana untuk dibandingkan.");
  if (uniq.some((i) => !data.scenarios.some((s) => s.id === i))) throw new InputError("Rencana tidak ditemukan.");
  return buildComparison(data, uniq);
}
