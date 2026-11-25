import { beforeAll, describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";
import { createPgliteDb, type Db } from "@/db/client";
import { auditLog, budgetPicks, budgetVersions } from "@/db/schema";
import * as d from "@/lib/budget/drives";
import { budgetCsvRows } from "@/lib/budget/export";
import * as b from "@/lib/budget/service";
import { compareBids } from "@/lib/budget/vendors";
import * as s from "@/lib/services";

const ver = (over: Partial<b.VersionInput> = {}): b.VersionInput => ({ ref: "", docDate: "", lines: [], ppnBp: 1100, pph23Bp: 200, notes: "", links: [], ...over });
const L = (item: string, unitPrice = 0, key?: string) => ({ key, item, qtyMilli: 1000, unit: "paket", unitPrice });

describe("budget phase 3", () => {
  let db: Db, u: string, pid: string, scopeId: string, vendorId: string, bidId: string, docId: string;
  const rows = async () => { const x = await b.getBudget(db, u, pid); return { scopes: x.scopes, bids: x.bids, docs: x.docs, versions: x.versions, picks: x.picks }; };
  beforeAll(async () => {
    db = await createPgliteDb();
    u = (await s.createUser(db, { name: "Sup", email: "p3@x.id", password: "password1" })).id;
    pid = (await s.createProject(db, u, { name: "Film", productionType: "feature_theatrical", platforms: ["Bioskop"], unitCount: null })).id;
    vendorId = (await b.createVendor(db, u, pid, { name: "Studio A" })).vendorId;
    scopeId = (await b.createScope(db, u, pid, { name: "Grading", budget: 200_000_000 })).scopeId;
    bidId = (await b.addBid(db, u, pid, scopeId, vendorId)).bidId;
    docId = (await b.getBudget(db, u, pid)).docs.find((x) => x.bidId === bidId)!.id;
  });

  it("lump: subtotal is the package price, sub-points unpriced, tax on subtotal", async () => {
    const r = await b.addVersion(db, u, pid, docId, ver({ pricing: "lump", lumpSum: 140_000_000, lines: [L("Color grading SDR", 999), L("Deliver DCP")] }));
    const [v] = await db.select().from(budgetVersions).where(eq(budgetVersions.id, r.versionId));
    expect(v.pricing).toBe("lump");
    expect(v.subtotal).toBe(140_000_000);
    expect(v.lines.every((l) => l.unitPrice === 0 && l.amount === 0)).toBe(true);
    expect(v.ppn).toBe(15_400_000);
    expect(v.pph23).toBe(2_800_000);
    await expect(b.addVersion(db, u, pid, docId, ver({ pricing: "lump", notes: "x", lines: [L("a")] }))).rejects.toThrow(/lump sum/);
  });

  it("stage: alternatif -> masuk -> disetujui", async () => {
    const names = new Map([[bidId, "Studio A"]]);
    expect(compareBids(scopeId, await rows(), names)[0].stage).toBeNull();
    await b.pickBid(db, u, pid, scopeId, bidId);
    expect(compareBids(scopeId, await rows(), names)[0].stage).toBe("masuk");
    const v = (await b.getBudget(db, u, pid)).versions.at(-1)!;
    await b.setVersionStatus(db, u, pid, v.id, "approved", "");
    expect(compareBids(scopeId, await rows(), names)[0].stage).toBe("disetujui");
  });

  it("correctVersion: approved moves approval and pick, audit summary has no amounts", async () => {
    const old = (await b.getBudget(db, u, pid)).versions.at(-1)!;
    const [pick0] = await db.select().from(budgetPicks);
    await db.update(budgetPicks).set({ versionId: old.id }).where(eq(budgetPicks.scopeId, pick0.scopeId));
    await expect(b.correctVersion(db, u, pid, old.id, ver({ pricing: "lump", lumpSum: 1 }), " ")).rejects.toThrow(/alasan/);
    const r = await b.correctVersion(db, u, pid, old.id, ver({ pricing: "lump", lumpSum: 135_000_000, lines: [L("Color grading SDR")] }), "salah ketik");
    const vs = (await b.getBudget(db, u, pid)).versions;
    const o = vs.find((x) => x.id === old.id)!, n = vs.find((x) => x.id === r.versionId)!;
    expect(o.status).toBe("superseded");
    expect(o.statusNote).toBe(`Dikoreksi oleh versi ${r.number}`);
    expect(n.status).toBe("approved");
    expect(n.correctsVersionId).toBe(old.id);
    expect((await db.select().from(budgetPicks))[0].versionId).toBe(n.id);
    const log = (await db.select().from(auditLog).where(eq(auditLog.projectId, pid))).find((a) => a.summary.startsWith("Koreksi versi"))!;
    expect(log.summary).toBe(`Koreksi versi ${old.number} → versi ${r.number} dari "Studio A"`);
    expect(log.summary).not.toMatch(/\d{4,}/);
    await expect(b.correctVersion(db, u, pid, old.id, ver({ lumpSum: 1 }), "lagi")).rejects.toThrow(/terbaru/);
  });

  it("custom vendor category: free text kept, built-in label maps to code", async () => {
    const id = (await b.createVendor(db, u, pid, { name: "Studio B", categories: ["Color Science", "grading", "GRADING", "Hard drive & storage"] })).vendorId;
    const v = (await b.getBudget(db, u, pid)).vendors.find((x) => x.id === id)!;
    expect(v.categories).toEqual(["Color Science", "grading", "drives"]);
    await expect(b.createVendor(db, u, pid, { name: "Studio C", categories: ["x".repeat(41)] })).rejects.toThrow();
  });

  it("drive lines keep brand and model, exported in CSV", async () => {
    await d.addDriveLine(db, u, pid, { brand: "SanDisk", model: "Extreme Pro", purpose: "ocf", media: "ssd", capacityGb: 1000, qty: 1, unitPrice: 1000, ppnBp: null, vendorId: null, neededBy: "", status: "planned", notes: "" });
    const plan = await d.getDrivePlan(db, u, pid);
    expect(plan.lines[0]).toMatchObject({ brand: "SanDisk", model: "Extreme Pro" });
    const csv = await budgetCsvRows(db, u, pid, "drives");
    expect(csv[0]).toContain("Merek");
    expect(csv[1]).toContain("SanDisk");
  });
});
