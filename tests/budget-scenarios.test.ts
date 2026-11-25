import { eq } from "drizzle-orm";
import { beforeAll, describe, expect, it } from "vitest";
import { createPgliteDb, type Db } from "@/db/client";
import { budgetDriveLines, budgetInvoices, budgetPicks, budgetScenarios } from "@/db/schema";
import { ForbiddenError } from "@/lib/auth/permissions";
import * as d from "@/lib/budget/drives";
import { rollup } from "@/lib/budget/rollup";
import * as sn from "@/lib/budget/scenarios";
import * as b from "@/lib/budget/service";
import { getToday, getWeeklyReport } from "@/lib/today/service";
import * as s from "@/lib/services";

describe("budget scenarios", () => {
  let db: Db, sup: string, asst: string, outsider: string, pid: string;
  const ver = (n = "v", sub = 1000000): b.VersionInput => ({ ref: "", docDate: "", lines: [], lumpSum: sub, ppnBp: null, pph23Bp: null, notes: n, links: [] });
  const drive = (price: number): d.DriveLineInput => ({ purpose: "ocf", media: "ssd", capacityGb: 1000, qty: 2, unitPrice: price, ppnBp: null, vendorId: null, neededBy: "", status: "planned", notes: "" });
  const mk = async (project: string, vendor: string, scope: string) => {
    const vendorId = (await b.createVendor(db, sup, project, { name: vendor })).vendorId;
    const scopeId = (await b.createScope(db, sup, project, { name: scope, budget: 5000000 })).scopeId;
    const { bidId } = await b.addBid(db, sup, project, scopeId, vendorId);
    const docId = (await b.getBudget(db, sup, project)).docs.find((x) => x.bidId === bidId && x.kind === "quote")!.id;
    return { vendorId, scopeId, bidId, docId };
  };
  const active = async (p = pid) => (await b.getBudget(db, sup, p)).scenarios.filter((x) => x.isActive);

  beforeAll(async () => {
    db = await createPgliteDb();
    sup = (await s.createUser(db, { name: "Sup", email: "sup@x.id", password: "password1" })).id;
    outsider = (await s.createUser(db, { name: "Out", email: "out@x.id", password: "password1" })).id;
    pid = (await s.createProject(db, sup, { name: "Film", productionType: "feature_theatrical", platforms: ["Bioskop"], unitCount: null })).id;
    await s.addMember(db, sup, pid, { email: "asst@x.id", role: "assistant", name: "Asst", password: "password1" });
    asst = (await s.listMembers(db, pid)).find((m) => m.role === "assistant")!.userId;
  });

  it("copy duplicates picks, calc and drive lines independently", async () => {
    const a = await mk(pid, "A-copy", "Grading copy");
    const v1 = await b.addVersion(db, sup, pid, a.docId, ver());
    await b.setVersionStatus(db, sup, pid, v1.versionId, "approved", "");
    await d.addDriveLine(db, sup, pid, drive(100));
    await d.saveDriveCalc(db, sup, pid, (await d.getDrivePlan(db, sup, pid)).calc);
    const orig = (await active())[0].id;
    const { scenarioId: copy } = await sn.createScenario(db, sup, pid, "Salinan", orig);
    const blank = (await sn.createScenario(db, sup, pid, "Kosong")).scenarioId;
    const lines = (id: string) => db.select().from(budgetDriveLines).where(eq(budgetDriveLines.scenarioId, id));
    const picks = (id: string) => db.select().from(budgetPicks).where(eq(budgetPicks.scenarioId, id));
    expect((await picks(copy)).length).toBe((await picks(orig)).length);
    expect((await lines(copy)).length).toBe(1);
    expect((await lines(copy))[0].id).not.toBe((await lines(orig))[0].id);
    expect((await picks(blank)).length + (await lines(blank)).length).toBe(0);
    const [c] = await db.select().from(budgetScenarios).where(eq(budgetScenarios.id, copy));
    expect(c.isActive).toBe(false);
    expect(c.driveCalc).toEqual((await db.select().from(budgetScenarios).where(eq(budgetScenarios.id, orig)))[0].driveCalc);
    await sn.pickInScenario(db, sup, pid, copy, a.scopeId, null, null);
    await db.update(budgetDriveLines).set({ unitPrice: 999 }).where(eq(budgetDriveLines.scenarioId, copy));
    expect((await picks(orig)).length).toBe(1);
    expect((await lines(orig))[0].unitPrice).toBe(100);
    await expect(sn.createScenario(db, sup, pid, "Salinan")).rejects.toThrow(/sudah dipakai/);
  });

  it("exactly one active; activate swaps atomically, also under concurrent activations", async () => {
    const p = (await s.createProject(db, sup, { name: "Aktif", productionType: "feature_theatrical", platforms: ["Bioskop"], unitCount: null })).id;
    const x = (await sn.createScenario(db, sup, p, "X")).scenarioId;
    const y = (await sn.createScenario(db, sup, p, "Y")).scenarioId;
    expect((await active(p)).map((r) => r.name)).toEqual(["Rencana utama"]);
    await sn.activateScenario(db, sup, p, x);
    expect((await active(p)).map((r) => r.id)).toEqual([x]);
    const r = await Promise.allSettled([sn.activateScenario(db, sup, p, x), sn.activateScenario(db, sup, p, y)]);
    expect(r.every((q) => q.status === "fulfilled")).toBe(true);
    expect((await active(p)).length).toBe(1);
  });

  it("cannot delete the active scenario; deleting another leaves invoices untouched", async () => {
    const p = (await s.createProject(db, sup, { name: "Hapus", productionType: "feature_theatrical", platforms: ["Bioskop"], unitCount: null })).id;
    const a = await mk(p, "A-del", "Del");
    await b.addInvoice(db, sup, p, { scopeId: a.scopeId, vendorId: a.vendorId, termin: "DP", ref: "", issueDate: "", dueDate: "", subtotal: 1000, status: "received", links: [], notes: "" });
    await b.pickBid(db, sup, p, a.scopeId, a.bidId);
    const act = (await active(p))[0].id;
    await expect(sn.deleteScenario(db, sup, p, act)).rejects.toThrow("Rencana aktif tidak bisa dihapus. Aktifkan rencana lain dulu.");
    const other = (await sn.createScenario(db, sup, p, "Lain", act)).scenarioId;
    await sn.deleteScenario(db, sup, p, other);
    expect((await db.select().from(budgetInvoices).where(eq(budgetInvoices.projectId, p))).length).toBe(1);
    expect((await b.getBudget(db, sup, p)).scenarios.length).toBe(1);
  });

  it("null version follows approval; pinned does not and is flagged stale after supersede", async () => {
    const p = (await s.createProject(db, sup, { name: "Pin", productionType: "feature_theatrical", platforms: ["Bioskop"], unitCount: null })).id;
    const a = await mk(p, "A-pin", "Pin");
    const v1 = await b.addVersion(db, sup, p, a.docId, ver("a", 1000000));
    await b.setVersionStatus(db, sup, p, v1.versionId, "approved", "");
    const act = (await active(p))[0].id;
    const B = (await sn.createScenario(db, sup, p, "B", act)).scenarioId;
    await sn.pickInScenario(db, sup, p, B, a.scopeId, a.bidId, v1.versionId);
    const v2 = await b.addVersion(db, sup, p, a.docId, ver("naik", 2000000));
    await b.setVersionStatus(db, sup, p, v2.versionId, "approved", "");
    const c = sn.buildComparison(await b.getBudget(db, sup, p), [act, B]);
    const [ca, cb] = c.scenarios.map((x) => x.cells[a.scopeId]);
    expect(ca).toMatchObject({ amount: 2000000, mode: "approved", label: "v2 (mengikuti persetujuan)", stale: false });
    expect(cb).toMatchObject({ amount: 1000000, mode: "pinned", label: "v1 (dikunci)", stale: true });
    expect(c.scenarios[1].diffFirst).toBe(-1000000);
    // rollup per scenario differs only in chosen
    const data = await b.getBudget(db, sup, p);
    const rows = (id: string) => rollup({ ...data, picks: data.allPicks.filter((x) => x.scenarioId === id), driveLines: [] }).rows;
    const [ra, rb] = [rows(act)[0], rows(B)[0]];
    expect(ra.chosen).not.toBe(rb.chosen);
    expect({ ...ra, chosen: 0, state: "", variance: 0, overBudget: 0, notInvoiced: 0, overInvoiced: 0 }).toEqual({ ...rb, chosen: 0, state: "", variance: 0, overBudget: 0, notInvoiced: 0, overInvoiced: 0 });
    expect(c.live).toEqual({ invoiced: 0, paid: 0 });
    // a pinned version that is later rejected is flagged too
    const v3 = await b.addVersion(db, sup, p, a.docId, ver("x", 3000000));
    await sn.pickInScenario(db, sup, p, B, a.scopeId, a.bidId, v3.versionId);
    await b.setVersionStatus(db, sup, p, v3.versionId, "sent", "");
    await b.setVersionStatus(db, sup, p, v3.versionId, "rejected", "");
    expect(sn.buildComparison(await b.getBudget(db, sup, p), [act, B]).scenarios[1].cells[a.scopeId].stale).toBe(true);
    await sn.pickInScenario(db, sup, p, B, a.scopeId, a.bidId, null);
    expect(sn.buildComparison(await b.getBudget(db, sup, p), [act, B]).scenarios[1].cells[a.scopeId]).toMatchObject({ amount: 2000000, stale: false });
  });

  it("pickInScenario rejects a bid from another scope and a version from another bid", async () => {
    const p = (await s.createProject(db, sup, { name: "Valid", productionType: "feature_theatrical", platforms: ["Bioskop"], unitCount: null })).id;
    const a = await mk(p, "A-val", "S1");
    const c = await mk(p, "C-val", "S2");
    const v = await b.addVersion(db, sup, p, c.docId, ver());
    await b.pickBid(db, sup, p, a.scopeId, a.bidId);
    const id = (await active(p))[0].id;
    await expect(sn.pickInScenario(db, sup, p, id, a.scopeId, c.bidId, null)).rejects.toThrow(/bukan bagian/);
    await expect(sn.pickInScenario(db, sup, p, id, a.scopeId, a.bidId, v.versionId)).rejects.toThrow(/Versi itu/);
    await expect(sn.pickInScenario(db, sup, p, "nope", a.scopeId, a.bidId, null)).rejects.toThrow(/tidak ditemukan/);
  });

  it("assistant reads the comparison but cannot write; non-member cannot read", async () => {
    const [x] = await active();
    const other = (await sn.createScenario(db, sup, pid, "Untuk asisten")).scenarioId;
    expect((await sn.getScenarioComparison(db, asst, pid, [x.id, other])).scenarios.length).toBe(2);
    await expect(sn.getScenarioComparison(db, sup, pid, [x.id])).rejects.toThrow(/2 sampai 4/);
    await expect(sn.createScenario(db, asst, pid, "Z")).rejects.toThrow(ForbiddenError);
    await expect(sn.activateScenario(db, asst, pid, other)).rejects.toThrow(ForbiddenError);
    await expect(sn.deleteScenario(db, asst, pid, other)).rejects.toThrow(ForbiddenError);
    await expect(sn.renameScenario(db, asst, pid, other, "Q")).rejects.toThrow(ForbiddenError);
    await expect(sn.pickInScenario(db, asst, pid, other, x.id, null, null)).rejects.toThrow(ForbiddenError);
    await expect(sn.getScenarioComparison(db, outsider, pid, [x.id, other])).rejects.toThrow(ForbiddenError);
  });

  it("scenario names and amounts do not leak; audit summaries carry no amounts; deleteProject works", async () => {
    const p = (await s.createProject(db, sup, { name: "Bocor2", productionType: "feature_theatrical", platforms: ["Bioskop"], unitCount: null })).id;
    const a = await mk(p, "V-X", "S");
    const v = await b.addVersion(db, sup, p, a.docId, ver("a", 987654321));
    await b.setVersionStatus(db, sup, p, v.versionId, "approved", "");
    const id = (await active(p))[0].id;
    const r1 = (await sn.createScenario(db, sup, p, "RENCANA-RAHASIA", id)).scenarioId;
    await sn.createScenario(db, sup, p, "Lagi", r1);
    await sn.pickInScenario(db, sup, p, r1, a.scopeId, a.bidId, v.versionId);
    await sn.renameScenario(db, sup, p, r1, "RENCANA-RAHASIA-2", "catatan");
    await sn.activateScenario(db, sup, p, r1);
    const link = await s.createShareLink(db, sup, p, "x");
    const out = JSON.stringify([await s.getViewerData(db, link.token), await getToday(db, p, "2026-05-05", { includeInternal: true }), await getWeeklyReport(db, p, "2026-05-05")]);
    expect(out).not.toContain("RENCANA-RAHASIA");
    expect(out).not.toContain("987654321");
    for (const e of (await s.listActivity(db, p, 100)).map((x) => x.entry).filter((x) => x.entity === "budget_scenario")) expect(e.summary).not.toMatch(/\d{5,}/);
    await s.deleteProject(db, sup, p, "Bocor2");
  });
});
