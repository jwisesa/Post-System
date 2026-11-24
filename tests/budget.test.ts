import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { eq } from "drizzle-orm";
import { beforeAll, describe, expect, it } from "vitest";
import { createPgliteDb, type Db } from "@/db/client";
import { budgetInvoices, budgetPayments, budgetVersions } from "@/db/schema";
import { ForbiddenError } from "@/lib/auth/permissions";
import { diffVersions } from "@/lib/budget/diff";
import { formatRupiah, lineAmount, paidPortion, parseQty, parseRateBp, parseRupiah, taxOf } from "@/lib/budget/money";
import { invoiceRow } from "@/lib/budget/invoice-view";
import { invoiceState, rollup } from "@/lib/budget/rollup";
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
    const bid = (await b.addBid(db, sup, p, sid, vid)).bidId;
    const inv = (await b.addInvoice(db, sup, p, { scopeId: sid, vendorId: vid, termin: "DP-RAHASIA", ref: "", issueDate: "2026-05-01", dueDate: "2026-05-05", subtotal: 987654321, status: "received", links: [], notes: "" })).invoiceId;
    await b.addPayment(db, sup, p, inv, { paidOn: "2026-05-06", amount: 987654321, note: "", link: "" });
    expect(bid).toBeTruthy();
    const link = await s.createShareLink(db, sup, p, "x");
    const out = JSON.stringify([await s.getViewerData(db, link.token), await getToday(db, p, "2026-05-05", { includeInternal: false }), await getToday(db, p, "2026-05-05", { includeInternal: true }), await getWeeklyReport(db, p, "2026-05-05")]);
    expect(out).not.toContain("VENDOR-RAHASIA");
    expect(out).not.toContain("987654321");
    expect(JSON.stringify(await s.listActivity(db, p, 50))).toContain("VENDOR-RAHASIA"); // the full change log still has it
    const hidden = JSON.stringify(await s.listActivity(db, p, 50, { hideBudget: true }));
    expect(hidden).not.toContain("VENDOR-RAHASIA");
    expect(hidden).not.toContain("DP-RAHASIA");
    const log = (await s.listActivity(db, p, 50)).map((r) => r.entry).filter((r) => r.entity.startsWith("budget_"));
    for (const r of log) expect(r.summary).not.toMatch(/\d{5,}/); // no amounts in any audit summary
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

describe("budget A2: compare, vendor table, undo approval", () => {
  let db: Db, sup: string, asst: string, out: string, pid: string, other: string;
  const L = (item: string, qty: number, price: number) => ({ item, qtyMilli: qty, unit: "jam", unitPrice: price });
  const V = (lines: b.VersionInput["lines"], notes = "n"): b.VersionInput => ({ ref: "", docDate: "", lines, ppnBp: 1100, pph23Bp: 200, notes, links: [] });
  const setup = async (vendor: string, scopeId: string) => {
    const { vendorId } = await b.createVendor(db, sup, pid, { name: vendor });
    const { bidId } = await b.addBid(db, sup, pid, scopeId, vendorId);
    const docId = (await b.getBudget(db, sup, pid)).docs.find((d) => d.bidId === bidId)!.id;
    return { bidId, docId };
  };
  beforeAll(async () => {
    db = await createPgliteDb();
    sup = (await s.createUser(db, { name: "Sup", email: "s@x.id", password: "password1" })).id;
    out = (await s.createUser(db, { name: "Out", email: "o@x.id", password: "password1" })).id;
    pid = (await s.createProject(db, sup, { name: "Film", productionType: "feature_theatrical", platforms: ["Bioskop"], unitCount: null })).id;
    other = (await s.createProject(db, out, { name: "Lain", productionType: "feature_theatrical", platforms: ["Bioskop"], unitCount: null })).id;
    await s.addMember(db, sup, pid, { email: "a@x.id", role: "assistant", name: "Asst", password: "password1" });
    asst = (await s.listMembers(db, pid)).find((m) => m.role === "assistant")!.userId;
  });

  it("compares across vendors; foreign and invalid ids are rejected; assistant may read", async () => {
    const { scopeId } = await b.createScope(db, sup, pid, { name: "Grading", category: "grading", budget: 150000000 });
    const A = await setup("A", scopeId), B = await setup("B", scopeId);
    const a1 = await b.addVersion(db, sup, pid, A.docId, V([L("Grading", 2500, 1000), L("Online", 1000, 500)]));
    const a2 = await b.addVersion(db, sup, pid, A.docId, V([L("Grading", 2500, 1200), L("DCP", 1000, 300)]));
    const b1 = await b.addVersion(db, sup, pid, B.docId, V([L("Grading", 2500, 900)]));
    const { compareVersions } = await import("@/lib/budget/compare");
    const c = await compareVersions(db, asst, pid, a2.versionId, b1.versionId);
    expect(c.a.vendor).toBe("A"); expect(c.b.vendor).toBe("B");
    expect(c.diff.rows.map((r) => r.kind).sort()).toEqual(["changed", "removed"]);
    const c2 = await compareVersions(db, sup, pid, a1.versionId, a2.versionId);
    expect(c2.diff.rows.map((r) => r.kind).sort()).toEqual(["added", "changed", "removed"]);
    await expect(compareVersions(db, sup, pid, a1.versionId, "nope")).rejects.toThrow(/tidak ditemukan/);
    await expect(compareVersions(db, sup, other, a1.versionId, a2.versionId)).rejects.toThrow(); // foreign project: not a member
    await expect(compareVersions(db, out, pid, a1.versionId, a2.versionId)).rejects.toBeInstanceOf(ForbiddenError); // non-member
    const { can } = await import("@/lib/auth/permissions");
    expect(can("assistant", "budget.view")).toBe(true);
    expect(can("assistant", "budget.edit")).toBe(false);
  });

  it("vendor comparison: cheapest, delta vs budget, state tags", async () => {
    const { compareBids } = await import("@/lib/budget/vendors");
    const rows = { scopes: [{ id: "s", budget: 1000 }], bids: [{ id: "x", scopeId: "s" }, { id: "y", scopeId: "s" }, { id: "z", scopeId: "s" }], docs: [{ id: "dx", bidId: "x", kind: "quote" as const }, { id: "dy", bidId: "y", kind: "quote" as const }, { id: "dz", bidId: "z", kind: "quote" as const }], versions: [{ id: "vx", docId: "dx", number: 1, status: "approved", subtotal: 1200 }, { id: "vy", docId: "dy", number: 1, status: "sent", subtotal: 800 }], picks: [{ scopeId: "s", bidId: "x", versionId: null }] };
    const r = compareBids("s", rows, new Map([["x", "X"], ["y", "Y"], ["z", "Z"]]));
    expect(r.map((x) => [x.state, x.chosen, x.cheapest, x.vsBudget, x.vsCheapest])).toEqual([["approved", true, false, -200, 400], ["provisional", false, true, 200, 0], ["none", false, false, null, null]]);
  });

  it("undo approval needs a note; pick stays and the scope turns provisional with a marker", async () => {
    const { scopeId } = await b.createScope(db, sup, pid, { name: "Sound", category: "sound", budget: 5000 });
    const A = await setup("A2", scopeId);
    const v = await b.addVersion(db, sup, pid, A.docId, V([L("Mix", 1000, 4000)]));
    await b.setVersionStatus(db, sup, pid, v.versionId, "approved", "");
    await expect(b.setVersionStatus(db, sup, pid, v.versionId, "negotiating", " ")).rejects.toThrow(/alasan/);
    await b.setVersionStatus(db, sup, pid, v.versionId, "negotiating", "harga berubah");
    const data = await b.getBudget(db, sup, pid);
    const row = rollup(data).rows.find((r) => r.scopeId === scopeId)!;
    expect(row.state).toBe("provisional"); expect(row.cancelled).toBe(true);
    expect(data.picks.some((p) => p.scopeId === scopeId && p.bidId === A.bidId)).toBe(true);
  });
});

describe("budget B: change orders, invoices, payments", () => {
  let db: Db, sup: string, asst: string, projectId: string;
  const ver = (over: Partial<b.VersionInput> = {}): b.VersionInput => ({ ref: "", docDate: "", lines: [], lumpSum: 50000000, ppnBp: 1100, pph23Bp: 200, notes: "n", links: [], ...over });
  const inv = (scopeId: string, vendorId: string, over: Partial<b.InvoiceInput> = {}): b.InvoiceInput => ({ scopeId, vendorId, termin: "DP 50%", ref: "", issueDate: "", dueDate: "", subtotal: 25000000, status: "received", links: [], notes: "", ...over });
  const pay = (amount: number, paidOn = "2026-06-01") => ({ paidOn, amount, note: "", link: "" });
  const mk = async (name: string, pid = projectId) => {
    const vendorId = (await b.createVendor(db, sup, pid, { name })).vendorId;
    const scopeId = (await b.createScope(db, sup, pid, { name: `S ${name}`, budget: 150000000 })).scopeId;
    const { bidId } = await b.addBid(db, sup, pid, scopeId, vendorId);
    const docId = (await b.getBudget(db, sup, pid)).docs.find((d) => d.bidId === bidId && d.kind === "quote")!.id;
    const v = await b.addVersion(db, sup, pid, docId, ver());
    await b.setVersionStatus(db, sup, pid, v.versionId, "approved", "");
    return { vendorId, scopeId, bidId, docId };
  };
  const nums = async (scopeId: string) => { const d = await b.getBudget(db, sup, projectId); return rollup(d).rows.find((r) => r.scopeId === scopeId)!; };
  beforeAll(async () => {
    db = await createPgliteDb();
    sup = (await s.createUser(db, { name: "Sup", email: "sup@x.id", password: "password1" })).id;
    projectId = (await s.createProject(db, sup, { name: "Film", productionType: "feature_theatrical", platforms: ["Bioskop"], unitCount: null })).id;
    await s.addMember(db, sup, projectId, { email: "asst@x.id", role: "assistant", name: "Asst", password: "password1" });
    asst = (await s.listMembers(db, projectId)).find((m) => m.role === "assistant")!.userId;
  });

  it("approved change orders add to chosen; rejected do not; negative totals reduce", async () => {
    const x = await mk("CO-A", projectId);
    const co = await b.createChangeOrder(db, sup, projectId, x.bidId, "Tambah 2 hari", ver({ lumpSum: 10000000 }));
    expect((await nums(x.scopeId)).chosen).toBe(50000000); // draft does not count
    await b.setVersionStatus(db, sup, projectId, co.versionId, "approved", "");
    expect((await nums(x.scopeId)).chosen).toBe(60000000);
    const co2 = await b.createChangeOrder(db, sup, projectId, x.bidId, "Kurangi", ver({ lumpSum: -4000000 }));
    await b.setVersionStatus(db, sup, projectId, co2.versionId, "approved", "");
    expect((await nums(x.scopeId)).chosen).toBe(56000000);
    const co3 = await b.createChangeOrder(db, sup, projectId, x.bidId, "Ditolak", ver({ lumpSum: 99000000 }));
    await b.setVersionStatus(db, sup, projectId, co3.versionId, "rejected", "");
    expect((await nums(x.scopeId)).chosen).toBe(56000000);
    await expect(b.addVersion(db, sup, projectId, x.docId, ver({ lumpSum: -1, notes: "x" }))).rejects.toThrow(/negatif/); // a quote cannot be negative
  });

  it("paidPortion is proportional and capped; lunas when payments >= net; overpayment flagged", async () => {
    const x = await mk("Pay-A");
    const i = (await b.addInvoice(db, sup, projectId, inv(x.scopeId, x.vendorId))).invoiceId; // 25.000.000 + 11% - 2% = 27.250.000
    const row = () => b.getBudget(db, sup, projectId).then((d) => d.invoices.find((r) => r.id === i)!);
    expect(await row()).toMatchObject({ ppn: 2750000, pph23: 500000, ppnRateBp: 1100 });
    await b.addPayment(db, sup, projectId, i, pay(13625000));
    let st = invoiceState(await row(), (await b.getBudget(db, sup, projectId)).payments);
    expect(st).toMatchObject({ net: 27250000, remaining: 13625000, lunas: false, portion: 12500000 });
    expect((await nums(x.scopeId)).paid).toBe(12500000);
    await b.addPayment(db, sup, projectId, i, pay(13625000, "2099-01-01")); // a future date is allowed
    st = invoiceState(await row(), (await b.getBudget(db, sup, projectId)).payments);
    expect(st).toMatchObject({ lunas: true, overpaid: 0, portion: 25000000 });
    await b.addPayment(db, sup, projectId, i, pay(1000));
    st = invoiceState(await row(), (await b.getBudget(db, sup, projectId)).payments);
    expect(st).toMatchObject({ overpaid: 1000, portion: 25000000 }); // capped
    expect((await nums(x.scopeId)).paid).toBe(25000000);
    await expect(b.addPayment(db, sup, projectId, i, pay(0))).rejects.toThrow(/lebih dari 0/);
    await expect(b.addPayment(db, sup, projectId, i, pay(5, "x"))).rejects.toThrow();
  });

  it("planned counts as planned, not invoiced; a non-chosen vendor's invoice still counts, tagged", async () => {
    const x = await mk("Plan-A");
    await b.addInvoice(db, sup, projectId, inv(x.scopeId, x.vendorId, { termin: "Pelunasan", status: "planned", ppnBp: null, pph23Bp: null }));
    await b.addInvoice(db, sup, projectId, inv(x.scopeId, x.vendorId, { subtotal: 20000000 }));
    expect(await nums(x.scopeId)).toMatchObject({ planned: 25000000, invoiced: 20000000, notInvoiced: 30000000, overInvoiced: 0 });
    const other = (await b.createVendor(db, sup, projectId, { name: "Plan-B" })).vendorId;
    await b.addBid(db, sup, projectId, x.scopeId, other);
    await b.addInvoice(db, sup, projectId, inv(x.scopeId, other, { subtotal: 40000000 }));
    const d = await b.getBudget(db, sup, projectId);
    expect(rollup(d).rows.find((r) => r.scopeId === x.scopeId)).toMatchObject({ invoiced: 60000000, overInvoiced: 10000000 });
    const pick = d.picks.find((p) => p.scopeId === x.scopeId)!;
    const tags = d.invoices.filter((i) => i.scopeId === x.scopeId).map((i) => invoiceRow(i, d.payments, "S", "V", d.bids.find((bb) => bb.id === pick.bidId)!.vendorId === i.vendorId).offChosen);
    expect(tags.filter(Boolean)).toHaveLength(1);
    await expect(b.addInvoice(db, sup, projectId, inv(x.scopeId, (await mk("Elsewhere")).vendorId))).rejects.toThrow(/bukan bagian/);
    expect((await b.addInvoice(db, sup, projectId, inv(x.scopeId, x.vendorId, { termin: "Tanpa pajak", ppnBp: null, pph23Bp: null }))).invoiceId).toBeTruthy();
  });

  it("blocks: deleteInvoice with payments, cancel with payments, delete scope/bid/vendor with invoices", async () => {
    const x = await mk("Blk-A");
    const i = (await b.addInvoice(db, sup, projectId, inv(x.scopeId, x.vendorId))).invoiceId;
    await b.addPayment(db, sup, projectId, i, pay(1000000));
    await expect(b.deleteInvoice(db, sup, projectId, i)).rejects.toThrow(/pembayaran/);
    await expect(b.updateInvoice(db, sup, projectId, i, inv(x.scopeId, x.vendorId, { status: "cancelled" }))).rejects.toThrow(/pembayaran/);
    await b.updateInvoice(db, sup, projectId, i, inv(x.scopeId, x.vendorId, { subtotal: 26000000 })); // editing is fine
    await expect(b.deleteScope(db, sup, projectId, x.scopeId)).rejects.toThrow(/Masih ada tagihan/);
    await expect(b.deleteBid(db, sup, projectId, x.bidId)).rejects.toThrow(/Masih ada tagihan/);
    await expect(b.deleteVendor(db, sup, projectId, x.vendorId)).rejects.toThrow(/Arsipkan/);
    const pid = (await b.getBudget(db, sup, projectId)).payments.find((p) => p.invoiceId === i)!.id;
    await b.deletePayment(db, sup, projectId, pid);
    await b.updateInvoice(db, sup, projectId, i, inv(x.scopeId, x.vendorId, { status: "cancelled" }));
    expect((await nums(x.scopeId)).invoiced).toBe(0);
    await b.deleteInvoice(db, sup, projectId, i);
    await b.deleteBid(db, sup, projectId, x.bidId);
  });

  it("assistant can read invoices, cannot write them", async () => {
    const x = await mk("Asst-A");
    const i = (await b.addInvoice(db, sup, projectId, inv(x.scopeId, x.vendorId))).invoiceId;
    expect((await b.getScope(db, asst, projectId, x.scopeId))!.invoices).toHaveLength(1);
    await expect(b.addInvoice(db, asst, projectId, inv(x.scopeId, x.vendorId))).rejects.toBeInstanceOf(ForbiddenError);
    await expect(b.addPayment(db, asst, projectId, i, pay(5))).rejects.toBeInstanceOf(ForbiddenError);
    await expect(b.deleteInvoice(db, asst, projectId, i)).rejects.toBeInstanceOf(ForbiddenError);
    await expect(b.createChangeOrder(db, asst, projectId, x.bidId, "X", ver())).rejects.toBeInstanceOf(ForbiddenError);
  });

  it("deleteProject still succeeds with invoices and payments", async () => {
    const p = (await s.createProject(db, sup, { name: "Hapus2", productionType: "feature_theatrical", platforms: ["Bioskop"], unitCount: null })).id;
    const x = await mk("Del-A", p);
    const i = (await b.addInvoice(db, sup, p, inv(x.scopeId, x.vendorId))).invoiceId;
    await b.addPayment(db, sup, p, i, pay(1000));
    await s.deleteProject(db, sup, p, "Hapus2");
    expect((await db.select().from(budgetInvoices).where(eq(budgetInvoices.projectId, p))).length).toBe(0);
    expect((await db.select().from(budgetPayments).where(eq(budgetPayments.projectId, p))).length).toBe(0);
  });
});
