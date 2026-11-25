// Vendors, scopes, bids, quote versions. Every read needs "budget.view", every write "budget.edit" plus an audit row in the
// same transaction. Audit SUMMARIES never carry amounts (they are printed on other pages); amounts live only in before/after,
// and entities named "budget_*" are hidden from Hari Ini and the weekly report (see listActivity).
// Saved version content is immutable: no function here updates it (and a DB trigger enforces it); only setVersionStatus
// touches a saved version, and only its status columns.
import { randomUUID } from "node:crypto";
import { and, asc, eq, inArray, lte, max, ne } from "drizzle-orm";
import { z } from "zod";
import type { Db } from "@/db/client";
import { budgetBids, budgetDocs, budgetDriveLines, budgetInvoices, budgetPayments, budgetPicks, budgetScenarios, budgetScopes, budgetVendors, budgetVersions, teamContacts, users, type BudgetLine, type BudgetVersionStatus } from "@/db/schema";
import { listDeliverables } from "../deliverables/service";
import { listPhases } from "../script/service";
import { InputError, listEntityActivity, record, requireRole, type Tx } from "../services";
import { CANCEL_MARK, DEFAULT_PPH23_BP, DEFAULT_PPN_BP, NEXT, SERVICE_CATEGORIES, VERSION_STATUSES, type VersionStatusCode } from "./catalog";
import { lineAmount, MAX_RP, taxOf } from "./money";
import { invoiceState } from "./rollup";

const view = (db: Db, u: string, p: string) => requireRole(db, u, p, "budget.view");
const edit = (db: Db, u: string, p: string) => requireRole(db, u, p, "budget.edit");
const str = (max: number) => z.string().max(max).transform((s) => s.trim());
const rp = z.number().int().min(-MAX_RP).max(MAX_RP); // Number.isSafeInteger holds for |x| <= 1e15
const fail = (r: { error: z.ZodError }): never => { throw new InputError(r.error.issues[0]?.message || "Data tidak valid."); };
const isUuid = (s: string) => /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(s);

// ---------- scenario ----------

/** The project's active scenario, created on first use ("Rencana utama"). Scenario UI comes later. */
export async function ensureActiveScenario(tx: Tx, projectId: string): Promise<string> {
  const find = () => tx.select({ id: budgetScenarios.id }).from(budgetScenarios).where(and(eq(budgetScenarios.projectId, projectId), eq(budgetScenarios.isActive, true)));
  const [have] = await find();
  if (have) return have.id;
  await tx.insert(budgetScenarios).values({ projectId, name: "Rencana utama", isActive: true }).onConflictDoNothing();
  return (await find())[0].id;
}

// ---------- reads ----------

export async function getBudget(db: Db, userId: string, projectId: string) {
  await view(db, userId, projectId);
  const [vendors, scopes, bids, docs, versions, scenario, invoices, payments] = await Promise.all([
    db.select().from(budgetVendors).where(eq(budgetVendors.projectId, projectId)).orderBy(asc(budgetVendors.name)),
    db.select().from(budgetScopes).where(eq(budgetScopes.projectId, projectId)).orderBy(asc(budgetScopes.sortOrder), asc(budgetScopes.createdAt), asc(budgetScopes.id)),
    db.select().from(budgetBids).where(eq(budgetBids.projectId, projectId)).orderBy(asc(budgetBids.createdAt)),
    db.select().from(budgetDocs).where(eq(budgetDocs.projectId, projectId)).orderBy(asc(budgetDocs.createdAt)),
    db.select({ v: budgetVersions, author: users.name }).from(budgetVersions).leftJoin(users, eq(users.id, budgetVersions.createdBy)).where(eq(budgetVersions.projectId, projectId)).orderBy(asc(budgetVersions.number)),
    db.select({ id: budgetScenarios.id }).from(budgetScenarios).where(and(eq(budgetScenarios.projectId, projectId), eq(budgetScenarios.isActive, true))),
    db.select().from(budgetInvoices).where(eq(budgetInvoices.projectId, projectId)).orderBy(asc(budgetInvoices.dueDate), asc(budgetInvoices.createdAt)),
    db.select().from(budgetPayments).where(eq(budgetPayments.projectId, projectId)).orderBy(asc(budgetPayments.paidOn), asc(budgetPayments.createdAt)),
  ]);
  const scenarioId = scenario[0]?.id ?? null;
  const [allScenarios, allPicks, allDriveLines] = await Promise.all([
    db.select().from(budgetScenarios).where(eq(budgetScenarios.projectId, projectId)).orderBy(asc(budgetScenarios.createdAt), asc(budgetScenarios.id)),
    db.select().from(budgetPicks).where(eq(budgetPicks.projectId, projectId)),
    db.select().from(budgetDriveLines).where(eq(budgetDriveLines.projectId, projectId)),
  ]);
  const picks = allPicks.filter((p) => p.scenarioId === scenarioId);
  const driveLines = allDriveLines.filter((l) => l.scenarioId === scenarioId);
  const scenarios = allScenarios.map((s) => ({ id: s.id, name: s.name, notes: s.notes, isActive: s.isActive, createdAt: s.createdAt, pickCount: allPicks.filter((p) => p.scenarioId === s.id).length, driveLineCount: allDriveLines.filter((l) => l.scenarioId === s.id).length }));
  return { scenarioId, scenarioName: scenarios.find((s) => s.id === scenarioId)?.name ?? null, scenarios, allPicks, allDriveLines, vendors, scopes, bids, docs, versions: versions.map((r) => ({ ...r.v, authorName: r.author ?? "—" })), picks, invoices, payments, driveLines };
}
export type BudgetData = Awaited<ReturnType<typeof getBudget>>;

export async function getScope(db: Db, userId: string, projectId: string, scopeId: string) {
  await view(db, userId, projectId);
  if (!isUuid(scopeId)) return null;
  const [scope] = await db.select().from(budgetScopes).where(and(eq(budgetScopes.id, scopeId), eq(budgetScopes.projectId, projectId)));
  if (!scope) return null;
  const all = await getBudget(db, userId, projectId);
  const bids = all.bids.filter((b) => b.scopeId === scopeId);
  const docs = all.docs.filter((d) => bids.some((b) => b.id === d.bidId));
  const [phases, deliverables] = await Promise.all([listPhases(db, projectId), listDeliverables(db, projectId, { includeInternal: true })]);
  return {
    scope,
    phases: phases.filter((p) => scope.phaseIds.includes(p.id)),
    deliverables: deliverables.filter((d) => scope.deliverableIds.includes(d.id)),
    scenarioName: all.scenarioName,
    vendors: all.vendors,
    bids,
    docs,
    versions: all.versions.filter((v) => docs.some((d) => d.id === v.docId)),
    picks: all.picks.filter((p) => p.scopeId === scopeId),
    invoices: all.invoices.filter((i) => i.scopeId === scopeId),
    payments: all.payments.filter((p) => all.invoices.some((i) => i.id === p.invoiceId && i.scopeId === scopeId)),
  };
}

/** Hari Ini card: planned or received-but-unpaid invoices due within 7 days or overdue, earliest first. Own query on purpose: never part of getToday. No amounts. */
export async function listDueInvoices(db: Db, userId: string, projectId: string, today: string, limit = 5) {
  await view(db, userId, projectId);
  const horizon = new Date(Date.parse(`${today}T00:00:00Z`) + 7 * 86400000).toISOString().slice(0, 10);
  const [rows, pays] = await Promise.all([
    db.select({ i: budgetInvoices, vendor: budgetVendors.name, scope: budgetScopes.name }).from(budgetInvoices)
      .innerJoin(budgetVendors, eq(budgetVendors.id, budgetInvoices.vendorId)).innerJoin(budgetScopes, eq(budgetScopes.id, budgetInvoices.scopeId))
      .where(and(eq(budgetInvoices.projectId, projectId), inArray(budgetInvoices.status, ["planned", "received"]), lte(budgetInvoices.dueDate, horizon))).orderBy(asc(budgetInvoices.dueDate), asc(budgetInvoices.createdAt)),
    db.select().from(budgetPayments).where(eq(budgetPayments.projectId, projectId)),
  ]);
  return rows
    .filter(({ i }) => i.dueDate && (i.status === "planned" || !invoiceState(i, pays.filter((p) => p.invoiceId === i.id)).lunas))
    .slice(0, limit)
    .map(({ i, vendor, scope }) => ({ id: i.id, scopeId: i.scopeId, scope, vendor, termin: i.termin, dueDate: i.dueDate!, late: i.dueDate! < today }));
}

/** Audit rows for one scope, newest first. Summaries carry no amounts; before/after may, so only budget readers get them. */
export async function getScopeHistory(db: Db, userId: string, projectId: string, scopeId: string, limit = 100) {
  await view(db, userId, projectId);
  if (!isUuid(scopeId)) return [];
  return listEntityActivity(db, projectId, "budget_scope", scopeId, limit);
}

export async function getVersions(db: Db, userId: string, projectId: string, ids: [string, string]) {
  await view(db, userId, projectId);
  const rows = await db.select().from(budgetVersions).where(and(eq(budgetVersions.projectId, projectId), inArray(budgetVersions.id, ids.filter(isUuid))));
  return ids.map((id) => rows.find((r) => r.id === id) ?? null);
}

// ---------- vendors ----------

const VendorSchema = z.object({
  name: str(120).refine((s) => s.length > 0, "Nama vendor wajib diisi."),
  categories: z.array(z.string().refine((c) => c in SERVICE_CATEGORIES, "Kategori tidak dikenal.")).max(8).default([]),
  contactName: str(120).default(""),
  email: str(200).refine((s) => s === "" || /^\S+@\S+\.\S+$/.test(s), "Email vendor tidak valid.").default(""),
  phone: str(40).default(""),
  teamContactId: z.string().nullable().default(null),
  chargesPpn: z.boolean().default(true),
  withholdsPph23: z.boolean().default(true),
  notes: str(2000).default(""),
});
export type VendorInput = z.input<typeof VendorSchema>;

async function checkVendor(tx: Tx | Db, projectId: string, input: VendorInput, selfId?: string) {
  const p = VendorSchema.safeParse(input);
  if (!p.success) return fail(p);
  const d = p.data;
  const [dup] = await tx.select({ id: budgetVendors.id }).from(budgetVendors).where(and(eq(budgetVendors.projectId, projectId), eq(budgetVendors.name, d.name)));
  if (dup && dup.id !== selfId) throw new InputError("Nama vendor sudah dipakai.");
  if (d.teamContactId) {
    const [c] = isUuid(d.teamContactId) ? await tx.select({ id: teamContacts.id }).from(teamContacts).where(and(eq(teamContacts.id, d.teamContactId), eq(teamContacts.projectId, projectId))) : [];
    if (!c) throw new InputError("Kontak tim tidak ditemukan.");
  }
  return d;
}

export async function createVendor(db: Db, userId: string, projectId: string, input: VendorInput) {
  await edit(db, userId, projectId);
  return db.transaction(async (tx) => {
    const d = await checkVendor(tx, projectId, input);
    const [v] = await tx.insert(budgetVendors).values({ ...d, projectId }).returning();
    await record(tx, { projectId, userId, entity: "budget_vendor", entityId: v.id, action: "create", summary: `Menambah vendor "${v.name}"`, after: v });
    return { vendorId: v.id };
  });
}

export async function updateVendor(db: Db, userId: string, projectId: string, vendorId: string, input: VendorInput) {
  await edit(db, userId, projectId);
  await db.transaction(async (tx) => {
    const [row] = await tx.select().from(budgetVendors).where(and(eq(budgetVendors.id, vendorId), eq(budgetVendors.projectId, projectId)));
    if (!row) throw new InputError("Vendor tidak ditemukan.");
    const d = await checkVendor(tx, projectId, input, vendorId);
    const keys = (Object.keys(d) as (keyof typeof d)[]).filter((k) => JSON.stringify(d[k]) !== JSON.stringify(row[k]));
    if (!keys.length) return;
    await tx.update(budgetVendors).set(d).where(eq(budgetVendors.id, vendorId));
    await record(tx, { projectId, userId, entity: "budget_vendor", entityId: vendorId, action: "update", summary: `Vendor "${d.name}": ${keys.join(", ")} diubah`, before: Object.fromEntries(keys.map((k) => [k, row[k]])), after: Object.fromEntries(keys.map((k) => [k, d[k]])) });
  });
}

export async function setVendorArchived(db: Db, userId: string, projectId: string, vendorId: string, archived: boolean) {
  await edit(db, userId, projectId);
  await db.transaction(async (tx) => {
    const [row] = await tx.update(budgetVendors).set({ archivedAt: archived ? new Date() : null }).where(and(eq(budgetVendors.id, vendorId), eq(budgetVendors.projectId, projectId))).returning();
    if (!row) throw new InputError("Vendor tidak ditemukan.");
    await record(tx, { projectId, userId, entity: "budget_vendor", entityId: vendorId, action: "update", summary: `${archived ? "Mengarsipkan" : "Memulihkan"} vendor "${row.name}"` });
  });
}

export async function deleteVendor(db: Db, userId: string, projectId: string, vendorId: string) {
  await edit(db, userId, projectId);
  await db.transaction(async (tx) => {
    const [row] = await tx.select().from(budgetVendors).where(and(eq(budgetVendors.id, vendorId), eq(budgetVendors.projectId, projectId)));
    if (!row) throw new InputError("Vendor tidak ditemukan.");
    const [inv] = await tx.select({ id: budgetInvoices.id }).from(budgetInvoices).where(eq(budgetInvoices.vendorId, vendorId)).limit(1);
    if (inv) throw new InputError("Vendor masih dipakai di penawaran/tagihan. Arsipkan saja.");
    const [used] = await tx.select({ id: budgetBids.id }).from(budgetBids).where(eq(budgetBids.vendorId, vendorId)).limit(1);
    if (used) throw new InputError("Vendor masih dipakai di penawaran/tagihan. Arsipkan saja.");
    const [dl] = await tx.select({ id: budgetDriveLines.id }).from(budgetDriveLines).where(eq(budgetDriveLines.vendorId, vendorId)).limit(1);
    if (dl) throw new InputError("Vendor masih dipakai di penawaran/tagihan. Arsipkan saja.");
    await tx.delete(budgetVendors).where(eq(budgetVendors.id, vendorId));
    await record(tx, { projectId, userId, entity: "budget_vendor", entityId: vendorId, action: "delete", summary: `Menghapus vendor "${row.name}"`, before: row });
  });
}

const HAS_INVOICES = "Masih ada tagihan. Hapus tagihan atau batalkan lingkup di anggaran.";

// ---------- scopes ----------

const ScopeSchema = z.object({
  name: str(120).refine((s) => s.length > 0, "Nama lingkup wajib diisi."),
  category: z.string().refine((c) => c in SERVICE_CATEGORIES, "Kategori tidak dikenal.").default("other"),
  budget: rp.min(0, "Budget tidak boleh negatif.").default(0),
  phaseIds: z.array(z.string()).max(50).default([]),
  deliverableIds: z.array(z.string()).max(100).default([]),
  notes: str(2000).default(""),
});
export type ScopeInput = z.input<typeof ScopeSchema>;

async function checkScope(db: Db, projectId: string, input: ScopeInput) {
  const p = ScopeSchema.safeParse(input);
  if (!p.success) return fail(p);
  const d = { ...p.data, phaseIds: [...new Set(p.data.phaseIds)], deliverableIds: [...new Set(p.data.deliverableIds)] };
  // Links have no foreign key (a timeline edit must never touch budget data), so check them here.
  const phases = new Set((await listPhases(db, projectId)).map((x) => x.id));
  if (d.phaseIds.some((i) => !phases.has(i))) throw new InputError("Fase tidak ditemukan di project ini.");
  if (d.deliverableIds.length) {
    const dels = new Set((await listDeliverables(db, projectId, { includeInternal: true })).map((x) => x.id));
    if (d.deliverableIds.some((i) => !dels.has(i))) throw new InputError("Deliverable tidak ditemukan di project ini.");
  }
  return d;
}

export async function createScope(db: Db, userId: string, projectId: string, input: ScopeInput) {
  await edit(db, userId, projectId);
  const d = await checkScope(db, projectId, input);
  return db.transaction(async (tx) => {
    const [m] = await tx.select({ n: max(budgetScopes.sortOrder) }).from(budgetScopes).where(eq(budgetScopes.projectId, projectId));
    const [s] = await tx.insert(budgetScopes).values({ ...d, projectId, sortOrder: (m?.n ?? 0) + 1 }).returning();
    await record(tx, { projectId, userId, entity: "budget_scope", entityId: s.id, action: "create", summary: `Menambah lingkup "${s.name}"`, after: s });
    return { scopeId: s.id };
  });
}

export async function updateScope(db: Db, userId: string, projectId: string, scopeId: string, input: ScopeInput) {
  await edit(db, userId, projectId);
  const d = await checkScope(db, projectId, input);
  await db.transaction(async (tx) => {
    const [row] = await tx.select().from(budgetScopes).where(and(eq(budgetScopes.id, scopeId), eq(budgetScopes.projectId, projectId)));
    if (!row) throw new InputError("Lingkup tidak ditemukan.");
    const keys = (Object.keys(d) as (keyof typeof d)[]).filter((k) => JSON.stringify(d[k]) !== JSON.stringify(row[k]));
    if (!keys.length) return;
    await tx.update(budgetScopes).set(d).where(eq(budgetScopes.id, scopeId));
    await record(tx, { projectId, userId, entity: "budget_scope", entityId: scopeId, action: "update", summary: `Lingkup "${d.name}": ${keys.join(", ")} diubah`, before: Object.fromEntries(keys.map((k) => [k, row[k]])), after: Object.fromEntries(keys.map((k) => [k, d[k]])) });
  });
}

/** Removes the scope with its bids, quotes and versions. The UI asks first. */
export async function deleteScope(db: Db, userId: string, projectId: string, scopeId: string) {
  await edit(db, userId, projectId);
  await db.transaction(async (tx) => {
    const [inv] = await tx.select({ id: budgetInvoices.id }).from(budgetInvoices).where(eq(budgetInvoices.scopeId, scopeId)).limit(1);
    if (inv) throw new InputError(HAS_INVOICES);
    const [row] = await tx.delete(budgetScopes).where(and(eq(budgetScopes.id, scopeId), eq(budgetScopes.projectId, projectId))).returning();
    if (!row) throw new InputError("Lingkup tidak ditemukan.");
    await record(tx, { projectId, userId, entity: "budget_scope", entityId: scopeId, action: "delete", summary: `Menghapus lingkup "${row.name}" beserta penawarannya`, before: row });
  });
}

// ---------- bids ----------

export async function addBid(db: Db, userId: string, projectId: string, scopeId: string, vendorId: string) {
  await edit(db, userId, projectId);
  return db.transaction(async (tx) => {
    const [scope] = await tx.select().from(budgetScopes).where(and(eq(budgetScopes.id, scopeId), eq(budgetScopes.projectId, projectId)));
    const [vendor] = isUuid(vendorId) ? await tx.select().from(budgetVendors).where(and(eq(budgetVendors.id, vendorId), eq(budgetVendors.projectId, projectId))) : [];
    if (!scope) throw new InputError("Lingkup tidak ditemukan.");
    if (!vendor) throw new InputError("Vendor tidak ditemukan.");
    if (vendor.archivedAt) throw new InputError("Vendor diarsipkan. Pulihkan dulu untuk menambahkannya.");
    const [dup] = await tx.select({ id: budgetBids.id }).from(budgetBids).where(and(eq(budgetBids.scopeId, scopeId), eq(budgetBids.vendorId, vendorId)));
    if (dup) throw new InputError("Vendor ini sudah ada di lingkup ini.");
    const [bid] = await tx.insert(budgetBids).values({ projectId, scopeId, vendorId }).returning();
    await tx.insert(budgetDocs).values({ projectId, bidId: bid.id, kind: "quote", title: "Penawaran" });
    await record(tx, { projectId, userId, entity: "budget_scope", entityId: scopeId, action: "create", summary: `Menambah vendor "${vendor.name}" ke lingkup "${scope.name}"` });
    return { bidId: bid.id };
  });
}

/** Removes a bid with its quotes and versions. The UI asks first. */
export async function deleteBid(db: Db, userId: string, projectId: string, bidId: string) {
  await edit(db, userId, projectId);
  await db.transaction(async (tx) => {
    const [b] = isUuid(bidId) ? await tx.select({ bid: budgetBids, vendor: budgetVendors.name, scope: budgetScopes.name }).from(budgetBids).innerJoin(budgetVendors, eq(budgetVendors.id, budgetBids.vendorId)).innerJoin(budgetScopes, eq(budgetScopes.id, budgetBids.scopeId)).where(and(eq(budgetBids.id, bidId), eq(budgetBids.projectId, projectId))) : [];
    if (!b) throw new InputError("Penawaran tidak ditemukan.");
    const [inv] = await tx.select({ id: budgetInvoices.id }).from(budgetInvoices).where(and(eq(budgetInvoices.scopeId, b.bid.scopeId), eq(budgetInvoices.vendorId, b.bid.vendorId))).limit(1);
    if (inv) throw new InputError(HAS_INVOICES);
    await tx.delete(budgetBids).where(eq(budgetBids.id, bidId));
    await record(tx, { projectId, userId, entity: "budget_scope", entityId: b.bid.scopeId, action: "delete", summary: `Menghapus vendor "${b.vendor}" dari lingkup "${b.scope}"`, before: b.bid });
  });
}

/** A change order series next to the quote (a new document, versioned the same way). */
export async function addChangeOrder(db: Db, userId: string, projectId: string, bidId: string, title: string) {
  await edit(db, userId, projectId);
  return db.transaction(async (tx) => {
    const [b] = isUuid(bidId) ? await tx.select().from(budgetBids).where(and(eq(budgetBids.id, bidId), eq(budgetBids.projectId, projectId))) : [];
    if (!b) throw new InputError("Penawaran tidak ditemukan.");
    const t = title.trim().slice(0, 120);
    if (!t) throw new InputError("Judul change order wajib diisi.");
    const [doc] = await tx.insert(budgetDocs).values({ projectId, bidId, kind: "change_order", title: t }).returning();
    await record(tx, { projectId, userId, entity: "budget_scope", entityId: b.scopeId, action: "create", summary: `Menambah change order "${t}"` });
    return { docId: doc.id };
  });
}

/** New change order series with its first version (a change order total may be negative: "Pengurangan"). */
export async function createChangeOrder(db: Db, userId: string, projectId: string, bidId: string, title: string, input: VersionInput) {
  const { docId } = await addChangeOrder(db, userId, projectId, bidId, title);
  try {
    return { docId, ...(await addVersion(db, userId, projectId, docId, input)) };
  } catch (e) {
    await db.delete(budgetDocs).where(eq(budgetDocs.id, docId)); // no empty orphan series
    throw e;
  }
}

// ---------- versions ----------

export type VersionInput = {
  ref: string;
  docDate: string;
  lines: { key?: string; item: string; qtyMilli: number; unit: string; unitPrice: number; note?: string }[];
  lumpSum?: number;
  ppnBp: number | null;
  pph23Bp: number | null;
  notes: string;
  links: string[];
};

const bp = z.number().int().min(0).max(10000).nullable();
const VersionSchema = z.object({
  ref: str(80).default(""),
  docDate: z.string().refine((s) => s === "" || (/^\d{4}-\d{2}-\d{2}$/.test(s) && !Number.isNaN(Date.parse(s))), "Tanggal dokumen tidak valid."),
  lines: z.array(z.object({
    key: z.string().max(64).optional(),
    item: str(200).refine((s) => s.length > 0, "Nama item wajib diisi."),
    qtyMilli: z.number().int().min(1, "Kuantitas harus lebih dari 0.").max(1e12),
    unit: str(20).default(""),
    unitPrice: rp, // may be negative: a "Diskon" line
    note: str(200).optional(),
  })).max(300),
  lumpSum: rp.optional(), // may be negative for a change order ("Pengurangan"); quotes are checked against the doc kind below
  ppnBp: bp,
  pph23Bp: bp,
  notes: str(1000).default(""),
  links: z.array(str(500)).max(5, "Maksimal 5 link."),
});

function checkLinks(links: string[]) {
  for (const l of links) {
    let ok = false;
    try { ok = ["http:", "https:"].includes(new URL(l).protocol); } catch { /* not a URL */ }
    if (!ok) throw new InputError(`Link "${l.slice(0, 40)}" harus diawali http:// atau https://.`);
  }
}

/** Saves a new immutable version. The server recomputes every amount and total; client totals are never read. */
export async function addVersion(db: Db, userId: string, projectId: string, docId: string, input: VersionInput): Promise<{ versionId: string; number: number }> {
  await edit(db, userId, projectId);
  const p = VersionSchema.safeParse(input);
  if (!p.success) return fail(p);
  const d = p.data;
  checkLinks(d.links);
  let lines: BudgetLine[] = [];
  let subtotal: number;
  if (d.lines.length) {
    const keys = new Set<string>();
    lines = d.lines.map((l) => {
      const key = l.key && !keys.has(l.key) ? l.key : randomUUID();
      keys.add(key);
      return { key, item: l.item, qtyMilli: l.qtyMilli, unit: l.unit, unitPrice: l.unitPrice, amount: lineAmount(l.qtyMilli, l.unitPrice), ...(l.note ? { note: l.note } : {}) };
    });
    subtotal = lines.reduce((n, l) => n + l.amount, 0);
  } else {
    if (d.lumpSum == null) throw new InputError("Isi rincian item atau jumlah lump sum.");
    subtotal = d.lumpSum;
  }
  if (!Number.isSafeInteger(subtotal) || subtotal > MAX_RP) throw new InputError("Jumlah terlalu besar.");
  const tax = taxOf(subtotal, d.ppnBp, d.pph23Bp);
  return db.transaction(async (tx) => {
    const [doc] = isUuid(docId) ? await tx.select().from(budgetDocs).where(and(eq(budgetDocs.id, docId), eq(budgetDocs.projectId, projectId))).for("update") : [];
    if (!doc) throw new InputError("Dokumen tidak ditemukan.");
    if (subtotal < 0 && doc.kind === "quote") throw new InputError("Subtotal penawaran tidak boleh negatif.");
    const [m] = await tx.select({ n: max(budgetVersions.number) }).from(budgetVersions).where(eq(budgetVersions.docId, docId));
    const number = (m?.n ?? 0) + 1;
    if (number > 1 && !d.notes) throw new InputError("Catatan perubahan wajib diisi untuk versi baru.");
    const [v] = await tx.insert(budgetVersions).values({
      projectId, docId, number, ref: d.ref, docDate: d.docDate || null, lines, subtotal, ppnRateBp: d.ppnBp, ppn: tax.ppn, pph23RateBp: d.pph23Bp, pph23: tax.pph23, notes: d.notes, links: d.links, createdBy: userId,
    }).returning();
    await tx.update(budgetVersions).set({ status: "superseded", statusNote: `Digantikan oleh versi ${number}`, statusBy: userId, statusAt: new Date() }).where(and(eq(budgetVersions.docId, docId), ne(budgetVersions.id, v.id), inArray(budgetVersions.status, ["draft", "sent", "negotiating"])));
    const [ctx] = await tx.select({ scopeId: budgetBids.scopeId, vendor: budgetVendors.name }).from(budgetBids).innerJoin(budgetVendors, eq(budgetVendors.id, budgetBids.vendorId)).where(eq(budgetBids.id, doc.bidId));
    await record(tx, { projectId, userId, entity: "budget_scope", entityId: ctx.scopeId, action: "create", summary: `Menambah versi ${number} ${doc.kind === "quote" ? "penawaran" : `change order "${doc.title}"`} dari "${ctx.vendor}"`, after: { number, ref: d.ref, subtotal, ppn: tax.ppn, pph23: tax.pph23 } });
    return { versionId: v.id, number };
  });
}

/** Moves a saved version along NEXT. Approving supersedes the doc's other approved version; approving a quote picks its bid in the active scenario. */
export async function setVersionStatus(db: Db, userId: string, projectId: string, versionId: string, status: string, note: string): Promise<{ picked: boolean; vendor: string }> {
  await edit(db, userId, projectId);
  if (!(status in VERSION_STATUSES)) throw new InputError("Status tidak dikenal.");
  const to = status as VersionStatusCode;
  const why = note.trim().slice(0, 500);
  return db.transaction(async (tx) => {
    const [found] = isUuid(versionId) ? await tx.select({ v: budgetVersions, doc: budgetDocs }).from(budgetVersions).innerJoin(budgetDocs, eq(budgetDocs.id, budgetVersions.docId)).where(and(eq(budgetVersions.id, versionId), eq(budgetVersions.projectId, projectId))) : [];
    if (!found) throw new InputError("Versi tidak ditemukan.");
    await tx.select({ id: budgetDocs.id }).from(budgetDocs).where(eq(budgetDocs.id, found.doc.id)).for("update"); // serialise status changes per doc
    const [v] = await tx.select().from(budgetVersions).where(eq(budgetVersions.id, versionId));
    const from = v.status as VersionStatusCode;
    if (!NEXT[from]?.includes(to)) throw new InputError(`Status "${VERSION_STATUSES[from]}" tidak bisa diubah ke "${VERSION_STATUSES[to]}".`);
    if (from === "approved" && !why) throw new InputError("Isi alasan pembatalan persetujuan (batal setujui).");
    const stamp = { statusNote: from === "approved" ? `${CANCEL_MARK}: ${why}` : why, statusBy: userId, statusAt: new Date() };
    if (to === "approved") {
      await tx.update(budgetVersions).set({ status: "superseded", statusNote: `Digantikan oleh versi ${v.number}`, statusBy: userId, statusAt: new Date() }).where(and(eq(budgetVersions.docId, v.docId), eq(budgetVersions.status, "approved"), ne(budgetVersions.id, v.id)));
    }
    await tx.update(budgetVersions).set({ status: to as BudgetVersionStatus, ...stamp }).where(eq(budgetVersions.id, versionId));
    const [ctx] = await tx.select({ bidId: budgetBids.id, scopeId: budgetBids.scopeId, scope: budgetScopes.name, vendor: budgetVendors.name }).from(budgetBids).innerJoin(budgetVendors, eq(budgetVendors.id, budgetBids.vendorId)).innerJoin(budgetScopes, eq(budgetScopes.id, budgetBids.scopeId)).where(eq(budgetBids.id, found.doc.bidId));
    await record(tx, { projectId, userId, entity: "budget_scope", entityId: ctx.scopeId, action: "update", summary: `Versi ${v.number} "${ctx.vendor}": ${VERSION_STATUSES[from]} → ${VERSION_STATUSES[to]}`, before: { status: from }, after: { status: to }, reason: why });
    let picked = false;
    if (to === "approved" && found.doc.kind === "quote") {
      const scenarioId = await ensureActiveScenario(tx, projectId);
      await tx.insert(budgetPicks).values({ scenarioId, scopeId: ctx.scopeId, bidId: ctx.bidId, versionId: null, projectId }).onConflictDoUpdate({ target: [budgetPicks.scenarioId, budgetPicks.scopeId], set: { bidId: ctx.bidId, versionId: null } });
      await record(tx, { projectId, userId, entity: "budget_scenario", entityId: scenarioId, action: "update", summary: `Memilih "${ctx.vendor}" untuk lingkup "${ctx.scope}" (otomatis dari persetujuan)`, after: { scopeId: ctx.scopeId, bidId: ctx.bidId } });
      picked = true;
    }
    return { picked, vendor: ctx.vendor };
  });
}

/** Chooses the bid for a scope in the active scenario (null clears it). The bid must belong to that scope. */
export async function pickBid(db: Db, userId: string, projectId: string, scopeId: string, bidId: string | null) {
  await edit(db, userId, projectId);
  await db.transaction(async (tx) => {
    const [scope] = isUuid(scopeId) ? await tx.select().from(budgetScopes).where(and(eq(budgetScopes.id, scopeId), eq(budgetScopes.projectId, projectId))) : [];
    if (!scope) throw new InputError("Lingkup tidak ditemukan.");
    let vendor = "";
    if (bidId) {
      const [b] = isUuid(bidId) ? await tx.select({ scopeId: budgetBids.scopeId, vendor: budgetVendors.name }).from(budgetBids).innerJoin(budgetVendors, eq(budgetVendors.id, budgetBids.vendorId)).where(and(eq(budgetBids.id, bidId), eq(budgetBids.projectId, projectId))) : [];
      if (!b || b.scopeId !== scopeId) throw new InputError("Vendor itu bukan bagian dari lingkup ini.");
      vendor = b.vendor;
    }
    const scenarioId = await ensureActiveScenario(tx, projectId);
    if (bidId) await tx.insert(budgetPicks).values({ scenarioId, scopeId, bidId, versionId: null, projectId }).onConflictDoUpdate({ target: [budgetPicks.scenarioId, budgetPicks.scopeId], set: { bidId, versionId: null } });
    else await tx.delete(budgetPicks).where(and(eq(budgetPicks.scenarioId, scenarioId), eq(budgetPicks.scopeId, scopeId)));
    await record(tx, { projectId, userId, entity: "budget_scenario", entityId: scenarioId, action: "update", summary: bidId ? `Memilih "${vendor}" untuk lingkup "${scope.name}"` : `Membatalkan pilihan vendor untuk lingkup "${scope.name}"`, after: { scopeId, bidId } });
  });
}

// ---------- invoices & payments ----------

export type InvoiceInput = {
  scopeId: string; vendorId: string; docId?: string | null;
  termin: string; ref: string; issueDate: string; dueDate: string;
  subtotal: number; ppnBp?: number | null; pph23Bp?: number | null; // undefined = the vendor's default
  status: "planned" | "received" | "cancelled"; links: string[]; notes: string;
};
const date = z.string().refine((s) => s === "" || (/^\d{4}-\d{2}-\d{2}$/.test(s) && !Number.isNaN(Date.parse(s))), "Tanggal tidak valid.");
const InvoiceSchema = z.object({
  scopeId: z.string(), vendorId: z.string(), docId: z.string().nullish(),
  termin: str(80).refine((s) => s.length > 0, "Nama termin wajib diisi."),
  ref: str(80).default(""), issueDate: date.default(""), dueDate: date.default(""),
  subtotal: rp.min(1, "Subtotal harus lebih dari 0."),
  ppnBp: bp.optional(), pph23Bp: bp.optional(),
  status: z.enum(["planned", "received", "cancelled"]),
  links: z.array(str(500)).max(5, "Maksimal 5 link."), notes: str(1000).default(""),
});

async function checkInvoice(tx: Tx, projectId: string, input: InvoiceInput) {
  const p = InvoiceSchema.safeParse(input);
  if (!p.success) return fail(p);
  const d = p.data;
  checkLinks(d.links);
  if (!isUuid(d.scopeId) || !isUuid(d.vendorId)) throw new InputError("Lingkup atau vendor tidak ditemukan.");
  const [bid] = await tx.select({ id: budgetBids.id, vendor: budgetVendors }).from(budgetBids).innerJoin(budgetVendors, eq(budgetVendors.id, budgetBids.vendorId)).where(and(eq(budgetBids.projectId, projectId), eq(budgetBids.scopeId, d.scopeId), eq(budgetBids.vendorId, d.vendorId)));
  if (!bid) throw new InputError("Vendor itu bukan bagian dari lingkup ini.");
  if (d.docId) {
    const [doc] = isUuid(d.docId) ? await tx.select({ id: budgetDocs.id }).from(budgetDocs).where(and(eq(budgetDocs.id, d.docId), eq(budgetDocs.bidId, bid.id))) : [];
    if (!doc) throw new InputError("Dokumen penawaran tidak ditemukan untuk vendor ini.");
  }
  const ppnBp = d.ppnBp === undefined ? (bid.vendor.chargesPpn ? DEFAULT_PPN_BP : null) : d.ppnBp;
  const pph23Bp = d.pph23Bp === undefined ? (bid.vendor.withholdsPph23 ? DEFAULT_PPH23_BP : null) : d.pph23Bp;
  const tax = taxOf(d.subtotal, ppnBp, pph23Bp); // frozen at save, like versions
  return { d, vendor: bid.vendor.name, row: { scopeId: d.scopeId, vendorId: d.vendorId, docId: d.docId || null, termin: d.termin, ref: d.ref, issueDate: d.issueDate || null, dueDate: d.dueDate || null, subtotal: d.subtotal, ppnRateBp: ppnBp, ppn: tax.ppn, pph23RateBp: pph23Bp, pph23: tax.pph23, status: d.status, links: d.links, notes: d.notes } };
}

const paymentsOf = (tx: Tx, invoiceId: string) => tx.select({ id: budgetPayments.id }).from(budgetPayments).where(eq(budgetPayments.invoiceId, invoiceId)).limit(1);

export async function addInvoice(db: Db, userId: string, projectId: string, input: InvoiceInput) {
  await edit(db, userId, projectId);
  return db.transaction(async (tx) => {
    const c = await checkInvoice(tx, projectId, input);
    const [inv] = await tx.insert(budgetInvoices).values({ ...c.row, projectId, createdBy: userId }).returning();
    await record(tx, { projectId, userId, entity: "budget_scope", entityId: inv.scopeId, action: "create", summary: `Menambah tagihan "${inv.termin}" dari "${c.vendor}"`, after: inv });
    return { invoiceId: inv.id };
  });
}

/** Scope and vendor of an invoice never change; everything else is editable with before/after in the log. */
export async function updateInvoice(db: Db, userId: string, projectId: string, invoiceId: string, input: InvoiceInput) {
  await edit(db, userId, projectId);
  await db.transaction(async (tx) => {
    const [old] = isUuid(invoiceId) ? await tx.select().from(budgetInvoices).where(and(eq(budgetInvoices.id, invoiceId), eq(budgetInvoices.projectId, projectId))).for("update") : [];
    if (!old) throw new InputError("Tagihan tidak ditemukan.");
    const c = await checkInvoice(tx, projectId, { ...input, scopeId: old.scopeId, vendorId: old.vendorId });
    if (c.row.status !== "received" && (await paymentsOf(tx, invoiceId)).length) throw new InputError("Tagihan ini sudah ada pembayaran. Hapus pembayaran dulu sebelum membatalkan atau mengubahnya jadi rencana.");
    const keys = (Object.keys(c.row) as (keyof typeof c.row)[]).filter((k) => JSON.stringify(c.row[k]) !== JSON.stringify(old[k]));
    if (!keys.length) return;
    await tx.update(budgetInvoices).set({ ...c.row, updatedAt: new Date() }).where(eq(budgetInvoices.id, invoiceId));
    await record(tx, { projectId, userId, entity: "budget_scope", entityId: old.scopeId, action: "update", summary: `Tagihan "${c.row.termin}" dari "${c.vendor}": ${keys.join(", ")} diubah`, before: Object.fromEntries(keys.map((k) => [k, old[k]])), after: Object.fromEntries(keys.map((k) => [k, c.row[k]])) });
  });
}

export async function deleteInvoice(db: Db, userId: string, projectId: string, invoiceId: string) {
  await edit(db, userId, projectId);
  await db.transaction(async (tx) => {
    const [inv] = isUuid(invoiceId) ? await tx.select().from(budgetInvoices).where(and(eq(budgetInvoices.id, invoiceId), eq(budgetInvoices.projectId, projectId))).for("update") : [];
    if (!inv) throw new InputError("Tagihan tidak ditemukan.");
    if ((await paymentsOf(tx, invoiceId)).length) throw new InputError("Tagihan ini sudah ada pembayaran. Hapus pembayaran dulu.");
    await tx.delete(budgetInvoices).where(eq(budgetInvoices.id, invoiceId));
    await record(tx, { projectId, userId, entity: "budget_scope", entityId: inv.scopeId, action: "delete", summary: `Menghapus tagihan "${inv.termin}"`, before: inv });
  });
}

export type PaymentInput = { paidOn: string; amount: number; note: string; link: string };
const PaymentSchema = z.object({
  paidOn: date.refine((s) => s !== "", "Tanggal bayar wajib diisi."), // a future date is allowed (scheduled transfer)
  amount: rp.min(1, "Jumlah bayar harus lebih dari 0."),
  note: str(500).default(""), link: str(500).default(""),
});

export async function addPayment(db: Db, userId: string, projectId: string, invoiceId: string, input: PaymentInput) {
  await edit(db, userId, projectId);
  const p = PaymentSchema.safeParse(input);
  if (!p.success) return fail(p);
  if (p.data.link) checkLinks([p.data.link]);
  return db.transaction(async (tx) => {
    const [inv] = isUuid(invoiceId) ? await tx.select().from(budgetInvoices).where(and(eq(budgetInvoices.id, invoiceId), eq(budgetInvoices.projectId, projectId))).for("update") : [];
    if (!inv) throw new InputError("Tagihan tidak ditemukan.");
    if (inv.status !== "received") throw new InputError("Tandai tagihan sebagai diterima dulu sebelum mencatat pembayaran.");
    const [pay] = await tx.insert(budgetPayments).values({ ...p.data, projectId, invoiceId, createdBy: userId }).returning();
    await record(tx, { projectId, userId, entity: "budget_scope", entityId: inv.scopeId, action: "create", summary: `Mencatat pembayaran tagihan "${inv.termin}"`, after: pay });
    return { paymentId: pay.id };
  });
}

export async function deletePayment(db: Db, userId: string, projectId: string, paymentId: string) {
  await edit(db, userId, projectId);
  await db.transaction(async (tx) => {
    const [r] = isUuid(paymentId) ? await tx.select({ pay: budgetPayments, scopeId: budgetInvoices.scopeId, termin: budgetInvoices.termin }).from(budgetPayments).innerJoin(budgetInvoices, eq(budgetInvoices.id, budgetPayments.invoiceId)).where(and(eq(budgetPayments.id, paymentId), eq(budgetPayments.projectId, projectId))) : [];
    if (!r) throw new InputError("Pembayaran tidak ditemukan.");
    await tx.delete(budgetPayments).where(eq(budgetPayments.id, paymentId));
    await record(tx, { projectId, userId, entity: "budget_scope", entityId: r.scopeId, action: "delete", summary: `Menghapus pembayaran tagihan "${r.termin}"`, before: r.pay });
  });
}
