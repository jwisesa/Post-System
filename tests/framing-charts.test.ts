import { beforeAll, describe, expect, it } from "vitest";
import { sql } from "drizzle-orm";
import { createPgliteDb, type Db } from "@/db/client";
import { auditLog } from "@/db/schema";
import { ForbiddenError } from "@/lib/auth/permissions";
import { DEFAULTS } from "@/lib/framing/frame";
import * as fr from "@/lib/framing/service";
import * as s from "@/lib/services";

const st = (p: Record<string, string> = {}) => ({ ...DEFAULTS, ...p });

describe("framing charts", () => {
  let db: Db, sup: string, asst: string, out: string, P: string, Q: string;
  beforeAll(async () => {
    db = await createPgliteDb();
    sup = (await s.createUser(db, { name: "Sup", email: "sup@x.id", password: "password1" })).id;
    out = (await s.createUser(db, { name: "Out", email: "out@x.id", password: "password1" })).id;
    P = (await s.createProject(db, sup, { name: "Film", productionType: "feature_theatrical", platforms: ["Bioskop"], unitCount: null })).id;
    Q = (await s.createProject(db, out, { name: "Lain", productionType: "feature_theatrical", platforms: ["Bioskop"], unitCount: null })).id;
    await s.addMember(db, sup, P, { email: "asst@x.id", role: "assistant", name: "Asst", password: "password1" });
    asst = (await s.listMembers(db, P)).find((m) => m.role === "assistant")!.userId;
  });

  it("saves, lists, renames, duplicates and deletes", async () => {
    const { id } = await fr.saveChart(db, sup, P, { name: "  Tes   A ", state: st({ cam: "x", project: "ignored" }) });
    let list = await fr.listCharts(db, P);
    expect(list.map((c) => c.name)).toEqual(["Tes A"]);
    expect("project" in list[0].state).toBe(false);
    await fr.saveChart(db, asst, P, { id, state: st({ crop: "9" }) }); // assistant may update; upsert by id
    expect((await fr.getChart(db, P, id))!.state.crop).toBe("9");
    await fr.renameChart(db, sup, P, id, "Tes B");
    const copy = await fr.duplicateChart(db, sup, P, id);
    const copy2 = await fr.duplicateChart(db, sup, P, id);
    list = await fr.listCharts(db, P);
    expect(list.map((c) => c.name).sort()).toEqual(["Tes B", "Tes B (salinan 2)", "Tes B (salinan)"]);
    await fr.deleteChart(db, sup, P, copy.id); await fr.deleteChart(db, sup, P, copy2.id); await fr.deleteChart(db, sup, P, id);
    expect(await fr.listCharts(db, P)).toEqual([]);
  });

  it("rejects duplicate names case-insensitively", async () => {
    const { id } = await fr.saveChart(db, sup, P, { name: "Kamera", state: st() });
    await expect(fr.saveChart(db, sup, P, { name: "kamera", state: st() })).rejects.toThrow(/Sudah ada chart bernama/);
    const b = await fr.saveChart(db, sup, P, { name: "Lain", state: st() });
    await expect(fr.renameChart(db, sup, P, b.id, "KAMERA")).rejects.toThrow(/Sudah ada/);
    await fr.saveChart(db, sup, Q, { name: "Kamera", state: st() }).catch(() => {}); // other project is independent (sup is not a member there)
    await fr.deleteChart(db, sup, P, id); await fr.deleteChart(db, sup, P, b.id);
  });

  it("caps at 50 charts", async () => {
    for (let i = 0; i < 50; i++) await fr.saveChart(db, sup, P, { name: `c${i}`, state: st() });
    await expect(fr.saveChart(db, sup, P, { name: "c50", state: st() })).rejects.toThrow(/Maksimal 50/);
    await db.execute(sql`delete from post_system.framing_charts where project_id = ${P}`);
  });

  it("forbids outsiders and keeps projects isolated", async () => {
    await expect(fr.saveChart(db, out, P, { name: "x", state: st() })).rejects.toBeInstanceOf(ForbiddenError);
    const { id } = await fr.saveChart(db, sup, P, { name: "Rahasia", state: st() });
    expect(await fr.getChart(db, Q, id)).toBeNull();
    expect(await fr.listCharts(db, Q)).toEqual([]);
    await expect(fr.deleteChart(db, out, Q, id)).rejects.toThrow(/tidak ditemukan/);
    await expect(fr.renameChart(db, out, Q, id, "x")).rejects.toThrow(/tidak ditemukan/);
    await expect(fr.saveChart(db, out, Q, { id, state: st() })).rejects.toThrow(/tidak ditemukan/);
    await expect(fr.duplicateChart(db, out, Q, id)).rejects.toThrow(/tidak ditemukan/);
    expect(await fr.getChart(db, P, "not-a-uuid")).toBeNull();
    await expect(fr.deleteChart(db, sup, P, "zzz")).rejects.toThrow(/tidak ditemukan/);
    expect((await fr.getChart(db, P, id))!.name).toBe("Rahasia");
  });

  it("audit log names the chart but holds no chart contents", async () => {
    await fr.saveChart(db, sup, P, { name: "Audit", state: st({ title: "RAHASIA-ISI", notes: "RAHASIA-ISI" }) });
    const rows = (await db.select().from(auditLog)).filter((r) => r.entity === "framing_chart");
    expect(rows.some((r) => r.summary === 'Menyimpan framing chart "Audit"')).toBe(true);
    expect(JSON.stringify(rows)).not.toContain("RAHASIA-ISI");
    expect(rows.every((r) => r.before == null && r.after == null)).toBe(true);
  });

  it("validates state", async () => {
    await expect(fr.saveChart(db, sup, P, { name: "g", state: "garbage" })).rejects.toThrow(/tidak valid/);
    await expect(fr.saveChart(db, sup, P, { name: "g", state: { evil: "1" } })).rejects.toThrow(/tidak valid/);
    await expect(fr.saveChart(db, sup, P, { name: "g", state: { cam: 5 } })).rejects.toThrow(/tidak valid/);
    await expect(fr.saveChart(db, sup, P, { name: "g", state: Object.fromEntries(Array.from({ length: 200 }, (_, i) => [`k${i}`, "x".repeat(40)])) })).rejects.toThrow(/tidak valid/);
    await expect(fr.saveChart(db, sup, P, { name: "   ", state: st() })).rejects.toThrow(/Nama chart/);
    const { id } = await fr.saveChart(db, sup, P, { name: "n".repeat(200) + "\u0000", state: { title: "z".repeat(500) } });
    const c = (await fr.getChart(db, P, id))!;
    expect(c.name.length).toBe(80); expect(c.state.title.length).toBe(120);
  });
});
