import { beforeAll, describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";
import { createPgliteDb, type Db } from "@/db/client";
import { auditLog, budgetDocs } from "@/db/schema";
import * as d from "@/lib/budget/drives";
import { budgetCsvRows, csvText } from "@/lib/budget/export";
import * as b from "@/lib/budget/service";
import * as s from "@/lib/services";

const ver = (over: Partial<b.VersionInput> = {}): b.VersionInput => ({ ref: "", docDate: "", lines: [], lumpSum: 1000, ppnBp: null, pph23Bp: null, notes: "", links: [], ...over });
const drive = (over: Partial<d.DriveLineInput> = {}): d.DriveLineInput => ({ purpose: "ocf", media: "ssd", capacityGb: 1000, qty: 1, unitPrice: 1000, ppnBp: null, vendorId: null, neededBy: "", status: "planned", notes: "", ...over });
const BAD = "not-a-uuid";

describe("budget review fixes", () => {
  let db: Db, u: string, pid: string, scopeId: string, vendorId: string, bidId: string, docId: string;
  beforeAll(async () => {
    db = await createPgliteDb();
    u = (await s.createUser(db, { name: "Sup", email: "sup@x.id", password: "password1" })).id;
    pid = (await s.createProject(db, u, { name: "Film", productionType: "feature_theatrical", platforms: ["Bioskop"], unitCount: null })).id;
    vendorId = (await b.createVendor(db, u, pid, { name: "=HYPERLINK(\"http://x\",\"klik\")" })).vendorId;
    scopeId = (await b.createScope(db, u, pid, { name: "Grading", budget: 5000 })).scopeId;
    bidId = (await b.addBid(db, u, pid, scopeId, vendorId)).bidId;
    docId = (await b.getBudget(db, u, pid)).docs.find((x) => x.bidId === bidId)!.id;
  });

  it("M3: text cells are neutralised, amounts stay numeric", async () => {
    expect(csvText("=1+1")).toBe("'=1+1");
    expect(csvText("-x")).toBe("'-x");
    expect(csvText("Biasa")).toBe("Biasa");
    await b.addVersion(db, u, pid, docId, ver({ lumpSum: 50000 }));
    const inv = await b.addInvoice(db, u, pid, { scopeId, vendorId, termin: "@cmd", ref: "", issueDate: "", dueDate: "", subtotal: 1000, status: "planned", links: [], notes: "" });
    expect(inv.invoiceId).toBeTruthy();
    const rows = await budgetCsvRows(db, u, pid, "versions");
    expect(rows[1][1]).toBe("'=HYPERLINK(\"http://x\",\"klik\")");
    const invs = await budgetCsvRows(db, u, pid, "invoices");
    expect(invs[1][2]).toBe("'@cmd");
    expect(invs[1][5]).toBe("1000");
  });

  it("M3: a negative change-order amount stays a plain number", async () => {
    await b.createChangeOrder(db, u, pid, bidId, "Kurang", ver({ lumpSum: -50000 }));
    expect((await budgetCsvRows(db, u, pid, "versions")).some((r) => r[6] === "-50000")).toBe(true);
  });

  it("L1: oversized line amounts are refused", async () => {
    const line = (qtyMilli: number, unitPrice: number) => ({ item: "x", qtyMilli, unit: "", unitPrice });
    await expect(b.addVersion(db, u, pid, docId, ver({ lumpSum: undefined, notes: "n", lines: [line(1e12, 1e15), line(1e12, -1e15)] }))).rejects.toThrow(/terlalu besar/);
    await expect(d.addDriveLine(db, u, pid, drive({ qty: 10000, unitPrice: 1e15 }))).rejects.toThrow(/terlalu besar/);
  });

  it("L2: prototype keys are not categories or statuses", async () => {
    await expect(b.createScope(db, u, pid, { name: "X", category: "toString" })).rejects.toThrow(/Kategori/);
    await b.createVendor(db, u, pid, { name: "Y", categories: ["constructor"] }); // vendor categories are free text now; categoryLabel uses hasOwn so it stays a plain string
    const vid = (await b.getBudget(db, u, pid)).versions[0].id;
    await expect(b.setVersionStatus(db, u, pid, vid, "toString", "")).rejects.toThrow(/Status tidak dikenal/);
  });

  it("L3: garbage ids give InputError, never a Postgres error", async () => {
    const calls: [string, () => Promise<unknown>][] = [
      ["updateVendor", () => b.updateVendor(db, u, pid, BAD, { name: "Z" })],
      ["setVendorArchived", () => b.setVendorArchived(db, u, pid, BAD, true)],
      ["deleteVendor", () => b.deleteVendor(db, u, pid, BAD)],
      ["updateScope", () => b.updateScope(db, u, pid, BAD, { name: "Z" })],
      ["deleteScope", () => b.deleteScope(db, u, pid, BAD)],
      ["addBid scope", () => b.addBid(db, u, pid, BAD, vendorId)],
      ["addBid vendor", () => b.addBid(db, u, pid, scopeId, BAD)],
      ["deleteBid", () => b.deleteBid(db, u, pid, BAD)],
      ["addChangeOrder", () => b.addChangeOrder(db, u, pid, BAD, "t")],
      ["createChangeOrder", () => b.createChangeOrder(db, u, pid, BAD, "t", ver())],
      ["addVersion", () => b.addVersion(db, u, pid, BAD, ver())],
      ["setVersionStatus", () => b.setVersionStatus(db, u, pid, BAD, "sent", "")],
      ["pickBid", () => b.pickBid(db, u, pid, BAD, null)],
      ["updateInvoice", () => b.updateInvoice(db, u, pid, BAD, {} as b.InvoiceInput)],
      ["deleteInvoice", () => b.deleteInvoice(db, u, pid, BAD)],
      ["addPayment", () => b.addPayment(db, u, pid, BAD, { paidOn: "2026-01-01", amount: 1, note: "", link: "" })],
      ["deletePayment", () => b.deletePayment(db, u, pid, BAD)],
      ["updateDriveLine", () => d.updateDriveLine(db, u, pid, BAD, drive())],
      ["deleteDriveLine", () => d.deleteDriveLine(db, u, pid, BAD)],
    ];
    for (const [name, fn] of calls) await expect(fn(), name).rejects.toThrow(s.InputError);
  });

  it("L4: concurrent duplicates end as InputError, one drives scope", async () => {
    const dup = await Promise.allSettled([1, 2].map(() => b.createVendor(db, u, pid, { name: "Kembar" })));
    expect(dup.filter((r) => r.status === "fulfilled")).toHaveLength(1);
    expect(dup.find((r) => r.status === "rejected")).toMatchObject({ reason: expect.any(s.InputError) });
    const sc2 = (await b.createScope(db, u, pid, { name: "Lain" })).scopeId;
    const bids = await Promise.allSettled([1, 2].map(() => b.addBid(db, u, pid, sc2, vendorId)));
    expect(bids.filter((r) => r.status === "fulfilled")).toHaveLength(1);
    expect(bids.find((r) => r.status === "rejected")).toMatchObject({ reason: expect.any(s.InputError) });
    await Promise.all([1, 2, 3].map(() => d.addDriveLine(db, u, pid, drive())));
    expect((await b.getBudget(db, u, pid)).scopes.filter((x) => x.category === "drives")).toHaveLength(1);
  });

  it("M2: a scope or vendor with drive lines cannot be deleted", async () => {
    const data = await b.getBudget(db, u, pid);
    const drives = data.scopes.find((x) => x.category === "drives")!;
    await expect(b.deleteScope(db, u, pid, drives.id)).rejects.toThrow(/daftar belanja harddisk/);
    const v2 = (await b.createVendor(db, u, pid, { name: "Toko Drive" })).vendorId;
    await d.addDriveLine(db, u, pid, drive({ vendorId: v2 }));
    await expect(b.deleteVendor(db, u, pid, v2)).rejects.toThrow(/harddisk/);
    await expect(b.deleteVendor(db, u, pid, vendorId)).rejects.toThrow(/penawaran|tagihan/);
  });

  it("L5: a failing first version leaves no doc and no audit row", async () => {
    const docs = (await db.select().from(budgetDocs)).length;
    const logs = (await db.select().from(auditLog).where(eq(auditLog.projectId, pid))).length;
    await expect(b.createChangeOrder(db, u, pid, bidId, "Gagal", ver({ links: ["ftp://x"] }))).rejects.toThrow(/http/);
    expect((await db.select().from(budgetDocs)).length).toBe(docs);
    expect((await db.select().from(auditLog).where(eq(auditLog.projectId, pid))).length).toBe(logs);
  });

  it("L6: tech history is found after 600 budget audit rows", async () => {
    await db.insert(auditLog).values({ projectId: pid, userId: u, entity: "tech_spec", entityId: pid, action: "update", summary: "tech" });
    await db.insert(auditLog).values(Array.from({ length: 600 }, () => ({ projectId: pid, userId: u, entity: "budget_scope", entityId: scopeId, action: "update" as const, summary: "x" })));
    expect((await s.listActivity(db, pid, 500)).some((r) => r.entry.entity === "tech_spec")).toBe(false);
    const rows = await s.listActivity(db, pid, 500, { entities: ["tech_spec"] });
    expect(rows.length).toBeGreaterThan(0);
    expect(rows.every((r) => r.entry.entity === "tech_spec")).toBe(true);
    expect((await s.listActivity(db, pid, 5, { hideBudget: true })).every((r) => !r.entry.entity.startsWith("budget_"))).toBe(true);
  });
});
