import { beforeAll, describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";
import { createPgliteDb, type Db } from "@/db/client";
import { auditLog, budgetVersions } from "@/db/schema";
import { diffVersions } from "@/lib/budget/diff";
import { budgetCsvRows } from "@/lib/budget/export";
import { sections } from "@/lib/budget/lines";
import * as b from "@/lib/budget/service";
import * as s from "@/lib/services";

type L = b.VersionInput["lines"][number];
const ver = (lines: L[], over: Partial<b.VersionInput> = {}): b.VersionInput => ({ ref: "", docDate: "", lines, ppnBp: null, pph23Bp: null, notes: "rev", links: [], ...over });
const I = (key: string, item: string, qty: number, unitPrice: number, group?: string, extra: Partial<L> = {}): L => ({ key, item, qtyMilli: qty * 1000, unit: "sesi", unitPrice, group, ...extra });

describe("budget mixed quote lines", () => {
  let db: Db, u: string, pid: string, docId: string;
  const get = async (id: string) => (await db.select().from(budgetVersions).where(eq(budgetVersions.id, id)))[0];
  beforeAll(async () => {
    db = await createPgliteDb();
    u = (await s.createUser(db, { name: "Sup", email: "ln@x.id", password: "password1" })).id;
    pid = (await s.createProject(db, u, { name: "Film", productionType: "feature_theatrical", platforms: ["Bioskop"], unitCount: null })).id;
    const vendorId = (await b.createVendor(db, u, pid, { name: "Audio" })).vendorId;
    const scopeId = (await b.createScope(db, u, pid, { name: "Audio post", budget: 500_000_000 })).scopeId;
    const bidId = (await b.addBid(db, u, pid, scopeId, vendorId)).bidId;
    docId = (await b.getBudget(db, u, pid)).docs.find((x) => x.bidId === bidId)!.id;
  });

  const quote = (): L[] => [
    I("pk", "Basic Bundled Service", 1, 220_000_000, "Basic", { kind: "package", unit: "paket" }),
    I("i1", "ADR", 1, 0, "Basic", { kind: "included", parent: "pk", note: "Yes" }),
    I("i2", "Foley", 1, 999, "Basic", { kind: "included", parent: "pk" }),
    I("sa", "Studio A", 3, 8_000_000, "Studio"),
    I("sb", "Studio B", 0, 9_000_000, "Studio"),
    I("ext", "External facility", 0, 0, "Studio", { kind: "note", priceState: "varies" }),
    I("ad", "Mixing 5.1", 2, 1_500_000, "Tambahan"),
    I("un", "Dolby Atmos", 0, 0, "Tambahan", { kind: "note", priceState: "unavailable", note: "belum ada" }),
    I("dk", "Diskon", 1, -4_000_000, "Tambahan"),
  ];

  it("counts only item/package; sections subtotal; tax on the sum", async () => {
    const r = await b.addVersion(db, u, pid, docId, ver(quote(), { notes: "", ppnBp: 1100, pph23Bp: 200 }));
    const v = await get(r.versionId);
    expect(v.subtotal).toBe(220_000_000 + 24_000_000 + 3_000_000 - 4_000_000);
    expect(v.ppn).toBe(26_730_000);
    expect(v.pph23).toBe(4_860_000);
    const inc = v.lines.find((l) => l.key === "i2")!;
    expect(inc.unitPrice).toBe(0); expect(inc.amount).toBe(0); expect(inc.parent).toBe("pk");
    expect(v.lines.find((l) => l.key === "sb")!.amount).toBe(0);
    expect(v.lines.find((l) => l.key === "un")).toMatchObject({ kind: "note", priceState: "unavailable", amount: 0 });
    expect(sections(v.lines).map((x) => [x.group, x.subtotal])).toEqual([["Basic", 220_000_000], ["Studio", 24_000_000], ["Tambahan", -1_000_000]]);
    const audit = await db.select().from(auditLog);
    expect(audit.every((a) => !/\d{6}/.test(a.summary))).toBe(true);
  });

  it("old items and lump versions are unchanged", async () => {
    const { vendorId } = await b.createVendor(db, u, pid, { name: "Old" });
    const scopeId = (await b.createScope(db, u, pid, { name: "Old scope", budget: 1 })).scopeId;
    const bidId = (await b.addBid(db, u, pid, scopeId, vendorId)).bidId;
    const d2 = (await b.getBudget(db, u, pid)).docs.find((x) => x.bidId === bidId)!.id;
    const r = await b.addVersion(db, u, pid, d2, ver([{ item: "Grading", qtyMilli: 2500, unit: "hari", unitPrice: 1_000_000 }], { notes: "" }));
    const v = await get(r.versionId);
    expect(v.subtotal).toBe(2_500_000);
    expect(v.lines[0].kind).toBeUndefined();
    const l = await b.addVersion(db, u, pid, d2, ver([{ item: "Sub", qtyMilli: 1000, unit: "", unitPrice: 5 }], { pricing: "lump", lumpSum: 7_000_000 }));
    const lv = await get(l.versionId);
    expect([lv.subtotal, lv.lines[0].amount, lv.lines[0].unitPrice]).toEqual([7_000_000, 0, 0]);
  });

  it("validation: lines count, group length, parent, qty, kind", async () => {
    const bad = (lines: L[], re: RegExp) => expect(b.addVersion(db, u, pid, docId, ver(lines))).rejects.toThrow(re);
    await bad(Array.from({ length: 301 }, (_, i) => I(`k${i}`, "x", 1, 1)), /./);
    await bad([I("a", "x", 1, 1, "g".repeat(61))], /./);
    await bad([I("a", "x", 1, 1, undefined, { kind: "included", parent: "nope" })], /Paket/);
    await bad([I("p", "p", 1, 1, undefined, { kind: "item" }), I("a", "x", 1, 0, undefined, { kind: "included", parent: "p" })], /Paket/);
    await bad([I("p", "p", 1, 1, undefined, { kind: "package" }), I("a", "x", 1, 1, undefined, { parent: "p" })], /Paket/);
    await bad([I("a", "x", -1, 1)], /./);
    await bad([{ ...I("a", "x", 1, 1), kind: "bogus" as never }], /./);
    await bad([I("a", "x", 1, 1, undefined, { note: "n".repeat(201) })], /./);
    await expect(b.addVersion(db, u, pid, docId, ver([I("a", "x", 1, 1, "g".repeat(60))]))).resolves.toBeTruthy();
  });

  it("diff matches by key and reports kind/group changes", () => {
    type BL = import("@/db/schema").BudgetLine;
    const line = (): BL => ({ key: "k", item: "Studio A", qtyMilli: 1000, unit: "sesi", unitPrice: 10, amount: 10 });
    const base = (over: Partial<BL> = {}): BL => ({ ...line(), ...over });
    const v = (lines: BL[]) => ({ lines, subtotal: 0, ppn: 0, pph23: 0 });
    const d = diffVersions(v([base(), { ...base(), key: "z", item: "Gone" }]), v([base({ group: "Studio", kind: "package" }), { ...base(), key: "n", item: "New" }]));
    const ch = d.rows.find((r) => r.key === "k")!;
    expect(ch.kind).toBe("changed");
    expect(ch.changes).toEqual(["jenis: Item → Paket", "bagian: — → Studio"]);
    expect(d.rows.find((r) => r.key === "n")!.kind).toBe("added");
    expect(d.rows.find((r) => r.key === "z")!.kind).toBe("removed");
    expect(diffVersions(v([base()]), v([base()])).rows[0].kind).toBe("same");
  });

  it("csv lines export has groups and guards formulas", async () => {
    await b.addVersion(db, u, pid, docId, ver([I("f", "=SUM(A1)", 1, 5, "Bagian X")]));
    const rows = await budgetCsvRows(db, u, pid, "lines");
    expect(rows[0]).toContain("Bagian");
    const r = rows.find((x) => x.includes("Bagian X"))!;
    expect(r).toContain("'=SUM(A1)");
    expect(rows.some((x) => x.includes("Termasuk paket") && x.includes("Basic"))).toBe(true);
    expect(rows.some((x) => x.includes("Harga bervariasi"))).toBe(true);
  });

  it("correctVersion keeps the new fields", async () => {
    const last = (await b.getBudget(db, u, pid)).versions.filter((x) => x.docId === docId).at(-1)!;
    const r = await b.correctVersion(db, u, pid, last.id, ver(quote(), { notes: "" }), "salah ketik");
    const v = await get(r.versionId);
    expect(v.lines.find((l) => l.key === "pk")).toMatchObject({ kind: "package", group: "Basic" });
    expect(v.lines.find((l) => l.key === "i1")).toMatchObject({ kind: "included", parent: "pk", note: "Yes" });
    expect(v.subtotal).toBe(243_000_000);
  });
});
