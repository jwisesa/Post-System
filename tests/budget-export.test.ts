import { eq } from "drizzle-orm";
import { beforeAll, describe, expect, it } from "vitest";
import { createPgliteDb, type Db } from "@/db/client";
import { budgetDriveLines } from "@/db/schema";
import { ForbiddenError } from "@/lib/auth/permissions";
import { calcSchema } from "@/lib/budget/capacity";
import * as d from "@/lib/budget/drives";
import { authorizeBudgetExport, budgetCsvRows, EXPORT_TYPES } from "@/lib/budget/export";
import * as sn from "@/lib/budget/scenarios";
import * as b from "@/lib/budget/service";
import { toCsv } from "@/lib/schedule/csv";
import { addDays } from "@/lib/schedule/dates";
import * as s from "@/lib/services";
import { getToday, getWeeklyReport } from "@/lib/today/service";

const TODAY = "2026-05-05";
const ver = (sub: number): b.VersionInput => ({ ref: "", docDate: "", lines: [], lumpSum: sub, ppnBp: null, pph23Bp: null, notes: "catatan, dengan\nbaris baru", links: [] });
const drive = (price: number): d.DriveLineInput => ({ purpose: "ocf", media: "ssd", capacityGb: 1000, qty: 2, unitPrice: price, ppnBp: null, vendorId: null, neededBy: "", status: "planned", notes: "" });

describe("budget phase E", () => {
  let db: Db, sup: string, asst: string, outsider: string, pid: string, scopeId: string, otherScope: string, vendorId: string, bidId: string, docId: string;
  beforeAll(async () => {
    db = await createPgliteDb();
    sup = (await s.createUser(db, { name: "Sup", email: "sup@x.id", password: "password1" })).id;
    outsider = (await s.createUser(db, { name: "Out", email: "out@x.id", password: "password1" })).id;
    pid = (await s.createProject(db, sup, { name: "Film", productionType: "feature_theatrical", platforms: ["Bioskop"], unitCount: null })).id;
    await s.addMember(db, sup, pid, { email: "asst@x.id", role: "assistant", name: "Asst", password: "password1" });
    asst = (await s.listMembers(db, pid)).find((m) => m.role === "assistant")!.userId;
    vendorId = (await b.createVendor(db, sup, pid, { name: "VENDOR-JATUH-TEMPO" })).vendorId;
    scopeId = (await b.createScope(db, sup, pid, { name: "Grading", budget: 5000000 })).scopeId;
    otherScope = (await b.createScope(db, sup, pid, { name: "Lain", budget: 1000 })).scopeId;
    bidId = (await b.addBid(db, sup, pid, scopeId, vendorId)).bidId;
    docId = (await b.getBudget(db, sup, pid)).docs.find((x) => x.bidId === bidId && x.kind === "quote")!.id;
    const v = await b.addVersion(db, sup, pid, docId, ver(1234567));
    await b.setVersionStatus(db, sup, pid, v.versionId, "approved", "");
    const inv = (termin: string, due: string, sub: number): b.InvoiceInput => ({ scopeId, vendorId, termin, ref: "", issueDate: "", dueDate: due, subtotal: sub, status: "received", links: [], notes: "" });
    await b.addInvoice(db, sup, pid, inv("Termin 1", addDays(TODAY, -3), 400000));
    await b.addInvoice(db, sup, pid, inv("Termin 2", addDays(TODAY, 30), 300000));
    await d.addDriveLine(db, sup, pid, drive(111000));
  });

  it("CSV export authorisation: non-member refused, assistant allowed", async () => {
    expect(await authorizeBudgetExport(db, null, "film")).toMatchObject({ ok: false, status: 401 });
    const slug = (await s.listProjects(db, sup))[0].project.slug;
    expect(await authorizeBudgetExport(db, { id: outsider }, slug)).toMatchObject({ ok: false, status: 404 });
    expect(await authorizeBudgetExport(db, { id: asst }, slug)).toMatchObject({ ok: true, projectId: pid });
    await expect(budgetCsvRows(db, outsider, pid, "scopes")).rejects.toThrow(ForbiddenError);
    expect((await budgetCsvRows(db, asst, pid, "scopes")).length).toBeGreaterThan(1);
  });

  it("CSV amounts are integers and headers have (Rp)", async () => {
    for (const type of EXPORT_TYPES) {
      const rows = await budgetCsvRows(db, sup, pid, type);
      const money = rows[0].map((h, i) => [h, i] as const).filter(([h]) => h.includes("(Rp)"));
      expect(money.length, type).toBeGreaterThan(0);
      for (const r of rows.slice(1)) for (const [, i] of money) expect(r[i], `${type} ${rows[0][i]}`).toMatch(/^-?\d*$/);
      expect(toCsv(rows)).not.toMatch(/\d\.\d{3}/);
    }
    expect((await budgetCsvRows(db, sup, pid, "versions"))[1][10]).toBe("catatan, dengan\nbaris baru");
    expect(toCsv(await budgetCsvRows(db, sup, pid, "versions"))).toContain('"catatan, dengan\nbaris baru"');
    const inv = await budgetCsvRows(db, sup, pid, "invoices");
    expect(inv[1].slice(5, 11)).toEqual(["400000", "44000", "8000", "436000", "0", "436000"]);
  });

  it("the Hari Ini due-invoice query is admin-only and never part of getToday/getWeeklyReport/getViewerData", async () => {
    await expect(b.listDueInvoices(db, outsider, pid, TODAY)).rejects.toThrow(ForbiddenError);
    const due = await b.listDueInvoices(db, asst, pid, TODAY);
    expect(due.map((x) => x.termin)).toEqual(["Termin 1"]);
    expect(due[0].late).toBe(true);
    const link = await s.createShareLink(db, sup, pid, "x");
    const out = JSON.stringify([await s.getViewerData(db, link.token), await getToday(db, pid, TODAY, { includeInternal: true, feedback: true }), await getWeeklyReport(db, pid, TODAY)]);
    for (const x of ["VENDOR-JATUH-TEMPO", "Termin 1", "400000", "1234567"]) expect(out).not.toContain(x);
    // paid invoices drop out
    const inv = (await b.getBudget(db, sup, pid)).invoices.find((i) => i.termin === "Termin 1")!;
    await b.addPayment(db, sup, pid, inv.id, { paidOn: TODAY, amount: 436000, note: "", link: "" });
    expect(await b.listDueInvoices(db, sup, pid, TODAY)).toEqual([]);
  });

  it("listEntityActivity returns only the scope's rows", async () => {
    const h = await b.getScopeHistory(db, sup, pid, scopeId);
    expect(h.length).toBeGreaterThan(2);
    expect(h.every((r) => r.entry.entity === "budget_scope" && r.entry.entityId === scopeId)).toBe(true);
    expect((await b.getScopeHistory(db, sup, pid, otherScope)).every((r) => r.entry.entityId === otherScope)).toBe(true);
    expect(h.some((r) => r.entry.summary.includes("Lain"))).toBe(false);
    expect(h.map((r) => +r.entry.createdAt)).toEqual([...h.map((r) => +r.entry.createdAt)].sort((x, y) => y - x));
    for (const r of h) expect(r.entry.summary).not.toMatch(/\d{5,}/);
    expect(await s.listEntityActivity(db, pid, "budget_scope", "x")).toEqual([]);
    await expect(b.getScopeHistory(db, outsider, pid, scopeId)).rejects.toThrow(ForbiddenError);
  });

  it("drive plan of a non-active scenario can be edited and does not change the active one", async () => {
    const active = (await b.getBudget(db, sup, pid)).scenarios.find((x) => x.isActive)!.id;
    const other = (await sn.createScenario(db, sup, pid, "Rencana B", active)).scenarioId;
    const lines = (id: string) => db.select().from(budgetDriveLines).where(eq(budgetDriveLines.scenarioId, id));
    const calcA = (await d.getDrivePlan(db, sup, pid)).calc;
    const calcB = { ...calcA, shootDays: calcA.shootDays + 7 };
    await d.saveDriveCalc(db, sup, pid, calcB, other);
    await d.addDriveLine(db, sup, pid, drive(222000), other);
    const planB = await d.getDrivePlan(db, asst, pid, { scenarioId: other });
    expect(planB.scenarioId).toBe(other);
    expect(planB.isActive).toBe(false);
    expect(planB.calc.shootDays).toBe(calcB.shootDays);
    expect(planB.lines.length).toBe(2);
    const planA = await d.getDrivePlan(db, sup, pid);
    expect(planA.scenarioId).toBe(active);
    expect(planA.lines.length).toBe(1);
    expect(planA.lines[0].unitPrice).toBe(111000);
    expect((await lines(active)).length).toBe(1);
    expect(calcSchema.safeParse(planA.calc).success).toBe(true);
    // validation: unknown or foreign scenario
    await expect(d.saveDriveCalc(db, sup, pid, calcB, "00000000-0000-4000-8000-000000000000")).rejects.toThrow(/Rencana tidak ditemukan/);
    await expect(d.addDriveLine(db, sup, pid, drive(1), "nope")).rejects.toThrow(/Rencana tidak ditemukan/);
    const p2 = (await s.createProject(db, sup, { name: "Film2", productionType: "feature_theatrical", platforms: ["Bioskop"], unitCount: null })).id;
    await b.getBudget(db, sup, p2);
    await expect(d.addDriveLine(db, sup, p2, drive(1), other)).rejects.toThrow(/Rencana tidak ditemukan/);
    await expect(d.saveDriveCalc(db, asst, pid, calcB, other)).rejects.toThrow(ForbiddenError);
    for (const e of (await s.listActivity(db, pid, 200)).map((x) => x.entry).filter((x) => x.entity.startsWith("budget_"))) expect(e.summary).not.toMatch(/\d{5,}/);
  });
});
