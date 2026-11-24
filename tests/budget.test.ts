import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { eq } from "drizzle-orm";
import { beforeAll, describe, expect, it } from "vitest";
import { createPgliteDb, type Db } from "@/db/client";
import { budgetVersions } from "@/db/schema";
import { ForbiddenError } from "@/lib/auth/permissions";
import { diffVersions } from "@/lib/budget/diff";
import { formatRupiah, lineAmount, paidPortion, parseQty, parseRateBp, parseRupiah, taxOf } from "@/lib/budget/money";
import { rollup } from "@/lib/budget/rollup";
import * as b from "@/lib/budget/service";
import { getWeeklyReport } from "@/lib/today/service";
import { getToday } from "@/lib/today/service";
import * as sched from "@/lib/schedule/service";
import * as sc from "@/lib/script/service";
import * as s from "@/lib/services";

describe("money", () => {
  it("parseRupiah reads Indonesian formats and rejects decimals", () => {
    expect(parseRupiah("Rp 1.250.000")).toBe(1250000);
    expect(parseRupiah("1250000")).toBe(1250000);
    expect(parseRupiah("1.250.000,00")).toBe(1250000);
    expect(parseRupiah("-50.000", { allowNegative: true })).toBe(-50000);
    expect(() => parseRupiah("1.250.000,50")).toThrow(/desimal/);
    expect(() => parseRupiah("1,2,3")).toThrow();
    expect(() => parseRupiah("-5")).toThrow();
    expect(formatRupiah(1250000)).toBe("Rp 1.250.000");
    expect(formatRupiah(-50000)).toBe("−Rp 50.000");
    expect(parseQty("2,5")).toBe(2500);
    expect(parseQty("0.5")).toBe(500);
    expect(() => parseQty("0")).toThrow();
    expect(parseRateBp("11")).toBe(1100);
    expect(parseRateBp("1,5")).toBe(150);
    expect(parseRateBp("")).toBeNull();
  });
  it("lineAmount rounds half away from zero with fractional qty", () => {
    expect(lineAmount(2500, 1000)).toBe(2500);
    expect(lineAmount(500, 3)).toBe(2); // 1.5 -> 2
    expect(lineAmount(500, -3)).toBe(-2);
    expect(lineAmount(1, 1499)).toBe(1); // 1.499 -> 1
  });
  it("taxOf: 11% PPN, 2% PPh 23, net = subtotal+ppn−pph", () => {
    expect(taxOf(1000000, 1100, 200)).toEqual({ subtotal: 1000000, ppn: 110000, pph23: 20000, gross: 1110000, net: 1090000 });
    expect(taxOf(1000, null, null).net).toBe(1000);
    expect(paidPortion({ subtotal: 1000000, ppn: 110000, pph23: 20000 }, 545000)).toBe(500000);
    expect(paidPortion({ subtotal: 0, ppn: 0, pph23: 0 }, 5)).toBe(0);
  });
});

describe("diffVersions", () => {
  const L = (key: string, item: string, qtyMilli: number, unitPrice: number) => ({ key, item, qtyMilli, unit: "jam", unitPrice, amount: lineAmount(qtyMilli, unitPrice) });
  it("matches by key, then by name, reports deltas", () => {
    const a = { lines: [L("1", "Grading", 1000, 100), L("2", "Online", 1000, 50), L("3", "DCP", 1000, 10)], subtotal: 160, ppn: 0, pph23: 0 };
    const bb = { lines: [L("1", "Grading", 1000, 120), L("x", "Online", 1000, 50), L("n", "Subtitle", 1000, 5)], subtotal: 175, ppn: 0, pph23: 0 };
    const d = diffVersions(a, bb);
    expect(d.rows.map((r) => r.kind)).toEqual(["changed", "same", "added", "removed"]);
    expect(d.rows[0].delta).toBe(20);
    expect(d.rows[3].item).toBe("DCP");
    expect(d.dSubtotal).toBe(15);
  });
});

describe("budget service", () => {
  let db: Db, sup: string, asst: string, outsider: string, projectId: string, phaseId: string;
  const line = (item: string, qty: number, price: number, key?: string) => ({ key, item, qtyMilli: qty, unit: "jam", unitPrice: price });
  const ver = (over: Partial<b.VersionInput> = {}): b.VersionInput => ({ ref: "Q-1", docDate: "2026-05-01", lines: [line("Grading", 1000, 1000000)], ppnBp: 1100, pph23Bp: 200, notes: "perubahan", links: [], ...over });
  const quoteDoc = async (bidId: string) => (await b.getBudget(db, sup, projectId)).docs.find((d) => d.bidId === bidId && d.kind === "quote")!.id;
  const mk = async (name: string, scopeName: string) => {
    const vendorId = (await b.createVendor(db, sup, projectId, { name })).vendorId;
    const scopeId = (await b.createScope(db, sup, projectId, { name: scopeName, category: "grading", budget: 150000000, phaseIds: [phaseId] })).scopeId;
    const { bidId } = await b.addBid(db, sup, projectId, scopeId, vendorId);
    return { vendorId, scopeId, bidId, docId: await quoteDoc(bidId) };
  };
  beforeAll(async () => {
    db = await createPgliteDb();
    sup = (await s.createUser(db, { name: "Sup", email: "sup@x.id", password: "password1" })).id;
    outsider = (await s.createUser(db, { name: "Out", email: "out@x.id", password: "password1" })).id;
    projectId = (await s.createProject(db, sup, { name: "Film", productionType: "feature_theatrical", platforms: ["Bioskop"], unitCount: null })).id;
    await s.addMember(db, sup, projectId, { email: "asst@x.id", role: "assistant", name: "Asst", password: "password1" });
    asst = (await s.listMembers(db, projectId)).find((m) => m.role === "assistant")!.userId;
    await sched.addTrack(db, sup, projectId, { name: "Post", template: "empty", startDate: "2026-03-02" });
    const track = (await sched.getSchedule(db, projectId, { includeInternal: true })).tracks[0];
    await sched.addItem(db, sup, projectId, { trackId: track.id, parentId: null, name: "Color Grading", startDate: "2026-05-01", dueDate: "2026-05-10" });
    phaseId = (await sc.listPhases(db, projectId))[0].id;
  });

  it("versions number 1..n per doc; concurrent addVersion never duplicates", async () => {
    const { docId } = await mk("V-Num", "Lingkup num");
    const r = await Promise.all([b.addVersion(db, sup, projectId, docId, ver()), b.addVersion(db, sup, projectId, docId, ver({ notes: "x" }))]);
    expect(r.map((x) => x.number).sort()).toEqual([1, 2]);
    expect((await b.addVersion(db, sup, projectId, docId, ver({ notes: "y" }))).number).toBe(3);
    await expect(b.addVersion(db, sup, projectId, docId, ver({ notes: " " }))).rejects.toThrow(/Catatan/);
  });

  it("saved version content cannot be updated (trigger)", async () => {
    const { docId } = await mk("V-Frozen", "Lingkup frozen");
    const { versionId } = await b.addVersion(db, sup, projectId, docId, ver());
    await expect(db.update(budgetVersions).set({ subtotal: 1 }).where(eq(budgetVersions.id, versionId))).rejects.toThrow();
    await expect(db.update(budgetVersions).set({ status: "sent" }).where(eq(budgetVersions.id, versionId))).resolves.toBeDefined();
  });

  it("status follows NEXT; one approved per doc; approve supersedes the previous", async () => {
    const { docId, scopeId } = await mk("V-Status", "Lingkup status");
    const v1 = await b.addVersion(db, sup, projectId, docId, ver());
    await expect(b.setVersionStatus(db, sup, projectId, v1.versionId, "superseded", "")).rejects.toThrow();
    await b.setVersionStatus(db, sup, projectId, v1.versionId, "approved", "");
    const v2 = await b.addVersion(db, sup, projectId, docId, ver({ notes: "harga baru", lines: [line("Grading", 1000, 900000)] }));
    await b.setVersionStatus(db, sup, projectId, v2.versionId, "approved", "");
    const vs = (await b.getScope(db, sup, projectId, scopeId))!.versions;
    expect(vs.map((v) => v.status)).toEqual(["superseded", "approved"]);
    await expect(b.setVersionStatus(db, sup, projectId, v2.versionId, "negotiating", "")).rejects.toThrow(/alasan/);
    await b.setVersionStatus(db, sup, projectId, v2.versionId, "negotiating", "batal setujui");
    await expect(b.setVersionStatus(db, sup, projectId, v2.versionId, "draft", "")).rejects.toThrow();
  });

  it("older open versions become superseded; edge cases (lump sum, discount, qty 0.5, links)", async () => {
    const { docId, scopeId } = await mk("V-Edge", "Lingkup edge");
    const a = await b.addVersion(db, sup, projectId, docId, ver({ lines: [], lumpSum: 5000000 }));
    const c = await b.addVersion(db, sup, projectId, docId, ver({ lines: [line("Jam", 500, 1001), line("Diskon", 1000, -100)], notes: "n", ppnBp: null, pph23Bp: null }));
    const vs = (await b.getScope(db, sup, projectId, scopeId))!.versions;
    expect(vs[0].status).toBe("superseded");
    expect(vs[0].subtotal).toBe(5000000);
    expect(vs[1].subtotal).toBe(501 - 100); // 0.5 x 1001 = 500.5 -> 501
    expect(vs[1].ppn).toBe(0);
    expect(a.number).toBe(1); expect(c.number).toBe(2);
    await expect(b.addVersion(db, sup, projectId, docId, ver({ notes: "n", links: Array(6).fill("https://a.id") }))).rejects.toThrow(/5/);
    await expect(b.addVersion(db, sup, projectId, docId, ver({ notes: "n", links: ["javascript:alert(1)"] }))).rejects.toThrow(/http/);
    await expect(b.addVersion(db, sup, projectId, docId, ver({ notes: "n", lines: [] }))).rejects.toThrow();
  });

  it("approving a quote picks the bid in the active scenario; rollup uses it", async () => {
    const { docId, scopeId, bidId } = await mk("V-Pick", "Lingkup pick");
    const v = await b.addVersion(db, sup, projectId, docId, ver());
    let data = await b.getBudget(db, sup, projectId);
    expect(rollup(data).rows.find((r) => r.scopeId === scopeId)!.state).toBe("none");
    const r = await b.setVersionStatus(db, sup, projectId, v.versionId, "approved", "");
    expect(r.picked).toBe(true);
    data = await b.getBudget(db, sup, projectId);
    expect(data.picks.find((p) => p.scopeId === scopeId)!.bidId).toBe(bidId);
    const row = rollup(data).rows.find((x) => x.scopeId === scopeId)!;
    expect(row).toMatchObject({ state: "approved", chosen: 1000000, variance: 149000000 });
    // a bid from another scope is rejected
    const other = await mk("V-Other", "Lingkup other");
    await expect(b.pickBid(db, sup, projectId, scopeId, other.bidId)).rejects.toThrow();
    await b.pickBid(db, sup, projectId, scopeId, null);
    expect((await b.getBudget(db, sup, projectId)).picks.some((p) => p.scopeId === scopeId)).toBe(false);
  });

  it("assistant can read, cannot write; non-member cannot read", async () => {
    expect((await b.getBudget(db, asst, projectId)).scopes.length).toBeGreaterThan(0);
    await expect(b.createVendor(db, asst, projectId, { name: "X" })).rejects.toBeInstanceOf(ForbiddenError);
    await expect(b.getBudget(db, outsider, projectId)).rejects.toBeInstanceOf(ForbiddenError);
    await expect(b.getScope(db, outsider, projectId, "x")).rejects.toBeInstanceOf(ForbiddenError);
  });

  it("validation: foreign phase, archived vendor, duplicate", async () => {
    const p2 = (await s.createProject(db, sup, { name: "Lain", productionType: "feature_theatrical", platforms: ["Bioskop"], unitCount: null })).id;
    await expect(b.createScope(db, sup, p2, { name: "X", phaseIds: [phaseId] })).rejects.toThrow(/Fase/);
    const v = (await b.createVendor(db, sup, projectId, { name: "Arsip" })).vendorId;
    await b.setVendorArchived(db, sup, projectId, v, true);
    const sId = (await b.createScope(db, sup, projectId, { name: "Arsip scope" })).scopeId;
    await expect(b.addBid(db, sup, projectId, sId, v)).rejects.toThrow(/diarsipkan/);
    await expect(b.createVendor(db, sup, projectId, { name: "Arsip" })).rejects.toThrow(/sudah/);
  });

  it("deleteVendor blocked when used; deleteProject still succeeds with budget data", async () => {
    const { vendorId } = await mk("V-Used", "Lingkup used");
    await expect(b.deleteVendor(db, sup, projectId, vendorId)).rejects.toThrow(/Arsipkan/);
    const p = (await s.createProject(db, sup, { name: "Hapus", productionType: "feature_theatrical", platforms: ["Bioskop"], unitCount: null })).id;
    const vid = (await b.createVendor(db, sup, p, { name: "A" })).vendorId;
    const sid = (await b.createScope(db, sup, p, { name: "S" })).scopeId;
    const { bidId } = await b.addBid(db, sup, p, sid, vid);
    const doc = (await b.getBudget(db, sup, p)).docs.find((d) => d.bidId === bidId)!.id;
    const v = await b.addVersion(db, sup, p, doc, ver());
    await b.setVersionStatus(db, sup, p, v.versionId, "approved", "");
    await s.deleteProject(db, sup, p, "Hapus");
    expect((await db.select().from(budgetVersions).where(eq(budgetVersions.projectId, p))).length).toBe(0);
  });

  it("budget never leaks", async () => {
    const p = (await s.createProject(db, sup, { name: "Bocor", productionType: "feature_theatrical", platforms: ["Bioskop"], unitCount: null })).id;
    const vid = (await b.createVendor(db, sup, p, { name: "VENDOR-RAHASIA" })).vendorId;
    const sid = (await b.createScope(db, sup, p, { name: "S", budget: 987654321 })).scopeId;
    await b.addBid(db, sup, p, sid, vid);
    const link = await s.createShareLink(db, sup, p, "x");
    const out = JSON.stringify([await s.getViewerData(db, link.token), await getToday(db, p, "2026-05-05", { includeInternal: false }), await getToday(db, p, "2026-05-05", { includeInternal: true }), await getWeeklyReport(db, p, "2026-05-05")]);
    expect(out).not.toContain("VENDOR-RAHASIA");
    expect(out).not.toContain("987654321");
    expect(JSON.stringify(await s.listActivity(db, p, 50))).toContain("VENDOR-RAHASIA"); // the full change log still has it
  });

  it("phase ids survive deleteItem + restoreVersion", async () => {
    const track = (await sched.getSchedule(db, projectId, { includeInternal: true })).tracks[0];
    await sched.addItem(db, sup, projectId, { trackId: track.id, parentId: null, name: "Temp", startDate: "2026-06-01", dueDate: "2026-06-05" });
    const tmp = (await sc.listPhases(db, projectId)).find((p) => p.name === "Temp")!.id;
    const scopeId = (await b.createScope(db, sup, projectId, { name: "Link", phaseIds: [phaseId, tmp] })).scopeId;
    await sched.saveVersion(db, sup, projectId, "v");
    const vid = (await sched.listVersions(db, projectId))[0].id;
    await sched.deleteItem(db, sup, projectId, tmp);
    await sched.restoreVersion(db, sup, projectId, vid);
    const [row] = (await b.getBudget(db, sup, projectId)).scopes.filter((x) => x.id === scopeId);
    expect(row.phaseIds).toContain(tmp);
    expect(row.phaseIds).toContain(phaseId);
  });
});

describe("isolation", () => {
  it("public code never imports lib/budget", () => {
    const hits: string[] = [];
    const walk = (d: string) => { for (const f of readdirSync(d)) { const p = join(d, f); if (statSync(p).isDirectory()) walk(p); else if (/\.tsx?$/.test(f) && /lib\/budget|budget-actions/.test(readFileSync(p, "utf8"))) hits.push(p); } };
    for (const d of ["src/app/v", "src/app/r", "src/lib/today"]) walk(d);
    expect(hits).toEqual([]);
  });
});
