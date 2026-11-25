import { eq } from "drizzle-orm";
import { beforeAll, describe, expect, it } from "vitest";
import { createPgliteDb, type Db } from "@/db/client";
import { budgetDriveLines } from "@/db/schema";
import { ForbiddenError } from "@/lib/auth/permissions";
import { calcSchema, compareTracker, computeNeed, seedCalc, type DriveCalc } from "@/lib/budget/capacity";
import { autoRate, matchRates, mergeRates, RATES, type RateRow } from "@/lib/budget/datarates";
import * as d from "@/lib/budget/drives";
import { rollup } from "@/lib/budget/rollup";
import * as b from "@/lib/budget/service";
import { getToday, getWeeklyReport } from "@/lib/today/service";
import * as s from "@/lib/services";

const base = (over: Partial<DriveCalc> = {}): DriveCalc => ({
  shootDays: 10, cameras: [{ id: "c", label: "C", mbps: 100, fps: 24, units: 1, minutesPerDay: 60 }], ocfCopies: 3,
  proxy: { copies: 0 }, gradePct: 0, gradeCopies: 0, vfxTb: 0, vfxCopies: 0, master: { runtimeMin: 0, versions: 0, copies: 0 },
  archiveCopies: 0, overheadPct: 10, fillPct: 80, driveTb: {}, ...over,
});
const line = (over: Partial<d.DriveLineInput> = {}): d.DriveLineInput => ({ purpose: "ocf", media: "ssd", capacityGb: 8000, qty: 6, unitPrice: 3500000, ppnBp: null, vendorId: null, neededBy: "", status: "planned", notes: "", ...over });

describe("data rates", () => {
  it("every built-in rate has an https source, positive mbps/refFps, unique ids", () => {
    expect(new Set(RATES.map((r) => r.id)).size).toBe(RATES.length);
    for (const r of RATES) {
      expect(r.source?.url.startsWith("https://")).toBe(true);
      expect(r.source?.title).toBeTruthy();
      expect(r.source?.accessed).toMatch(/^\d{4}-\d{2}-\d{2}$/);
      expect(r.mbps).toBeGreaterThan(0);
      expect(r.refFps).toBeGreaterThan(0);
    }
  });
  it("matchRates: exact alias scores, ambiguous returns several, film skipped", () => {
    const m = matchRates(RATES, { model: "RED V-Raptor", format: "REDCODE RAW (R3D)", res: "8K" });
    expect(m.filter((x) => x.score === 3).length).toBe(4);
    expect(m.length).toBe(8); // the 6K rows match model and format only
    expect(autoRate(RATES, { model: "RED V-Raptor", format: "REDCODE RAW (R3D)", res: "8K" })).toBeNull();
    expect(autoRate(RATES, { format: "ProRes 422 HQ", res: "1920x1080 (HD)" })?.id).toBe("pr-hq");
    expect(matchRates(RATES, { model: "ARRI Alexa Mini LF", format: "ARRIRAW", res: "nope" })[0].score).toBe(2);
    expect(matchRates(RATES, { model: "Foo", format: "ProRes 4444", res: "" })[0].score).toBe(1);
    expect(matchRates(RATES, { model: "Foo", format: "ProRes 42" })).toEqual([]); // no fuzzy
    const t = { cam1_model: "ARRICAM ST", cam1_media: "Film 35mm", cam1_fps: "24" };
    expect(seedCalc(t, RATES).cameras[0]).toMatchObject({ mbps: 0, note: "Kamera film: isi data scan manual" });
  });
  it("mergeRates: project rows override by id", () => {
    const own: RateRow = { ...RATES[0], source: null, mbps: 99 };
    const m = mergeRates(RATES, [own, { ...own, id: "p-x" }]);
    expect(m.find((r) => r.id === RATES[0].id)!.mbps).toBe(99);
    expect(m.length).toBe(RATES.length + 1);
  });
});

describe("capacity", () => {
  it("computeNeed worked example by hand", () => {
    const r = computeNeed(base(), RATES).rows[0];
    expect(r.raw).toBeCloseTo(450e9, 0); // 12.5e6 B/s * 3600 s * 10 days
    expect(r.total).toBeCloseTo(1.485e12, -3);
    expect(r.capacity).toBeCloseTo(1.85625e12, -3);
    expect(r.drives).toBeNull();
  });
  it("drives are rounded per copy", () => {
    const r = computeNeed(base({ driveTb: { ocf: 0.4 } }), RATES).rows[0]; // perCopy 495 GB, usable 320 GB -> 2 drives per copy
    expect(r.drives).toBe(6);
  });
  it("seedCalc reads cam1 via sourceFormat and cam2 via cam2_format; fps fallback", () => {
    const tech = { cam1_model: "RED V-Raptor", sourceFormat: "REDCODE RAW (R3D)", cam1_res: "8K", cam2_model: "Foo", cam2_format: "ProRes 422 HQ", cam2_res: "1920x1080 (HD)", cam2_fps: "25", frameRate: "23.976", dit_backup1: "SSD", dit_backup2: "HDD", proxyCodec: "ProRes 422 Proxy", offline_res: "1920x1080 (HD)" };
    const c = seedCalc(tech, RATES);
    expect(c.cameras.map((x) => x.slot)).toEqual([1, 2]);
    expect(c.cameras[0].rateId).toBeUndefined(); // ambiguous R3D
    expect(c.cameras[0].fps).toBe(23.976);
    expect(c.cameras[1]).toMatchObject({ rateId: "pr-hq", fps: 25 });
    expect(c.ocfCopies).toBe(3);
    expect(c.proxy.rateId).toBe("pr-proxy");
    expect(seedCalc({}, RATES).cameras).toEqual([]);
    expect(seedCalc({ cam1_model: "X" }, RATES).cameras[0].fps).toBe(24);
  });
  it("calcSchema rejects out-of-range numbers", () => {
    expect(calcSchema.safeParse(base()).success).toBe(true);
    expect(calcSchema.safeParse(base({ fillPct: 0 })).success).toBe(false);
    expect(calcSchema.safeParse(base({ shootDays: -1 })).success).toBe(false);
    expect(calcSchema.safeParse(base({ ocfCopies: 99 })).success).toBe(false);
  });
  it("tracker compare degrades to unlinked/unavailable", () => {
    const need = computeNeed(base(), RATES);
    expect(compareTracker(need, [], { state: "unlinked" })).toEqual({ state: "unlinked" });
    expect(compareTracker(need, [], { state: "unavailable", reason: "x" })).toEqual({ state: "unavailable", reason: "x" });
    const ok = compareTracker(need, [{ purpose: "ocf", qty: 4, status: "planned" }, { purpose: "ocf", qty: 9, status: "cancelled" }], { state: "ok", project: { name: "p", status: "x" }, total: 5, byStatus: { available: 0, in_use: 0, damaged: 0, completed: 0, archived: 0 }, backupDrives: 2, rawDrives: 1, totalBytes: 450e9, outstanding: 0, lastUpdate: null });
    expect(ok).toMatchObject({ state: "ok", plannedDrives: 4, recordedDrives: 3, pct: 33 });
  });
});

describe("drive service", () => {
  let db: Db, sup: string, asst: string, projectId: string;
  beforeAll(async () => {
    db = await createPgliteDb();
    sup = (await s.createUser(db, { name: "Sup", email: "sup@x.id", password: "password1" })).id;
    projectId = (await s.createProject(db, sup, { name: "Film", productionType: "feature_theatrical", platforms: ["Bioskop"], unitCount: null })).id;
    await s.addMember(db, sup, projectId, { email: "asst@x.id", role: "assistant", name: "Asst", password: "password1" });
    asst = (await s.listMembers(db, projectId)).find((m) => m.role === "assistant")!.userId;
  });
  it("first drive line creates the Hard drive scope; rollup adds to chosen; cancelled excluded", async () => {
    await d.addDriveLine(db, sup, projectId, line());
    const { lineId } = await d.addDriveLine(db, sup, projectId, line({ qty: 2, unitPrice: 1000 }));
    await d.addDriveLine(db, sup, projectId, line({ status: "cancelled" }));
    let data = await b.getBudget(db, sup, projectId);
    expect(data.scopes.filter((x) => x.category === "drives").length).toBe(1);
    expect(rollup(data).rows[0].chosen).toBe(6 * 3500000 + 2000);
    await d.updateDriveLine(db, sup, projectId, lineId, line({ qty: 3, unitPrice: 1000 }));
    data = await b.getBudget(db, sup, projectId);
    expect(rollup(data).rows[0].chosen).toBe(6 * 3500000 + 3000);
    await expect(d.addDriveLine(db, sup, projectId, line({ capacityGb: NaN }))).rejects.toThrow(/Kapasitas/);
    const log = JSON.stringify((await s.listActivity(db, projectId, 50)).map((r) => r.entry.summary));
    expect(log).not.toMatch(/\d{5,}/);
  });
  it("assistant reads plan, cannot save", async () => {
    const plan = await d.getDrivePlan(db, asst, projectId);
    expect(plan.lines.length).toBe(3);
    expect(plan.tracker).toBeNull();
    await expect(d.saveDriveCalc(db, asst, projectId, base())).rejects.toThrow(ForbiddenError);
    await expect(d.addDriveLine(db, asst, projectId, line())).rejects.toThrow(ForbiddenError);
    await d.saveDriveCalc(db, sup, projectId, base());
    expect((await d.getDrivePlan(db, sup, projectId)).seeded).toBe(false);
    await d.saveRates(db, sup, projectId, [{ ...RATES[0], source: null, mbps: 77 }, { id: "p-1", maker: "Proyek", label: "Mine", models: [], formats: ["x"], res: [], refFps: 24, mbps: 10, source: null }]);
    const plan2 = await d.getDrivePlan(db, sup, projectId);
    expect(plan2.rates.find((r) => r.id === RATES[0].id)!.mbps).toBe(77);
    expect(plan2.projectRateIds).toContain("p-1");
    await expect(d.saveRates(db, sup, projectId, [{ id: "zzz", maker: "", label: "x", models: [], formats: [], res: [], refFps: 24, mbps: 1, source: null }])).rejects.toThrow();
  });
  it("drive prices never leak; deleteProject succeeds with drive lines", async () => {
    const p = (await s.createProject(db, sup, { name: "Bocor", productionType: "feature_theatrical", platforms: ["Bioskop"], unitCount: null })).id;
    const v = (await b.createVendor(db, sup, p, { name: "V-DRV" })).vendorId;
    await d.addDriveLine(db, sup, p, line({ unitPrice: 987654321, vendorId: v }));
    await expect(b.deleteVendor(db, sup, p, v)).rejects.toThrow(/Arsipkan/);
    const link = await s.createShareLink(db, sup, p, "x");
    const out = JSON.stringify([await s.getViewerData(db, link.token), await getToday(db, p, "2026-05-05", { includeInternal: true }), await getWeeklyReport(db, p, "2026-05-05")]);
    expect(out).not.toContain("987654321");
    expect(JSON.stringify(await s.listActivity(db, p, 50, { hideBudget: true }))).not.toContain("987654321");
    await s.deleteProject(db, sup, p, "Bocor");
    expect((await db.select().from(budgetDriveLines).where(eq(budgetDriveLines.projectId, p))).length).toBe(0);
  });
});
