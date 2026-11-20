import { readFileSync } from "node:fs";
import { eq } from "drizzle-orm";
import { beforeAll, describe, expect, it } from "vitest";
import { createPgliteDb, type Db } from "@/db/client";
import { auditLog, scriptScenes } from "@/db/schema";
import { ForbiddenError } from "@/lib/auth/permissions";
import { extractPages } from "@/lib/script/extract";
import { parseScreenplay } from "@/lib/script/parse";
import { needsByPhase, postCsvRows, postNeeds } from "@/lib/script/needs";
import * as sc from "@/lib/script/service";
import { defaultPhase, suggestTags } from "@/lib/script/tags";
import { isBuiltinKind, kindDef, TAG_KINDS } from "@/lib/script/types";
import * as s from "@/lib/services";

describe("custom tag kinds", () => {
  let db: Db, sup: string, asst: string, outsider: string, projectId: string, scriptId: string, sceneIds: string[];
  beforeAll(async () => {
    db = await createPgliteDb();
    sup = (await s.createUser(db, { name: "Sup", email: "supk@x.id", password: "password1" })).id;
    outsider = (await s.createUser(db, { name: "Out", email: "outk@x.id", password: "password1" })).id;
    projectId = (await s.createProject(db, sup, { name: "Film", productionType: "feature_theatrical", platforms: ["Bioskop"], unitCount: null })).id;
    await s.addMember(db, sup, projectId, { email: "askk@x.id", role: "assistant", name: "Asst", password: "password1" });
    asst = (await s.listMembers(db, projectId)).find((m) => m.role === "assistant")!.userId;
    const { scenes, pages } = parseScreenplay(await extractPages(new Uint8Array(readFileSync("tests/fixtures/script/sample-letter.pdf"))));
    scriptId = (await sc.importScript(db, sup, projectId, { title: "Draft", sourceName: "a.pdf", pages, scenes })).scriptId;
    sceneIds = (await sc.getScript(db, projectId, scriptId))!.scenes.map((x) => x.id);
  });
  const get = async () => (await sc.getScript(db, projectId, scriptId))!.scenes;
  const keyOf = async (label: string) => (await sc.listKinds(db, projectId)).find((k) => k.label === label)!;

  it("creates, renames, recolours, reorders; only supervisors; assistants read; outsiders cannot write", async () => {
    const a = await sc.createKind(db, sup, projectId, { label: "  Stock   footage ", color: 3 });
    expect(a.key).toBe("c-stock-footage");
    await sc.createKind(db, sup, projectId, { label: "Subtitle", color: 4 });
    await sc.createKind(db, sup, projectId, { label: "Clearance lagu", color: 6 });
    await expect(sc.createKind(db, asst, projectId, { label: "Nope", color: 1 })).rejects.toBeInstanceOf(ForbiddenError);
    await expect(sc.createKind(db, outsider, projectId, { label: "Nope", color: 1 })).rejects.toBeInstanceOf(ForbiddenError);
    await expect(sc.updateKind(db, asst, projectId, a.id, { label: "X" })).rejects.toBeInstanceOf(ForbiddenError);
    await expect(sc.moveKind(db, asst, projectId, a.id, 1)).rejects.toBeInstanceOf(ForbiddenError);
    await expect(sc.deleteKind(db, asst, projectId, a.id)).rejects.toBeInstanceOf(ForbiddenError);
    expect((await sc.getKinds(db, projectId)).map((k) => k.label)).toContain("Stock footage"); // reading needs no role beyond the page's membership check
    await sc.updateKind(db, sup, projectId, a.id, { label: "Stock footage 2", color: 5 });
    expect(await keyOf("Stock footage 2")).toMatchObject({ key: "c-stock-footage", color: 5 }); // rename keeps the key
    await sc.moveKind(db, sup, projectId, a.id, 1);
    expect((await sc.listKinds(db, projectId)).map((k) => k.label)).toEqual(["Subtitle", "Stock footage 2", "Clearance lagu"]);
    await sc.moveKind(db, sup, projectId, a.id, 1);
    await sc.moveKind(db, sup, projectId, a.id, 1); // already last: no-op
    expect((await sc.listKinds(db, projectId)).map((k) => k.label)).toEqual(["Subtitle", "Clearance lagu", "Stock footage 2"]);
    await expect(sc.updateKind(db, sup, projectId, a.id, { color: 9 })).rejects.toThrow("Warna");
    const all = (await sc.getKinds(db, projectId)).map((k) => k.key);
    expect(all.slice(0, 7)).toEqual([...TAG_KINDS]); // built-ins first, in order
    await sc.updateKind(db, sup, projectId, a.id, { label: "Stock footage" });
  });

  it("rejects duplicate labels case-insensitively (built-ins too) and caps at 12", async () => {
    await expect(sc.createKind(db, sup, projectId, { label: "STOCK FOOTAGE", color: 1 })).rejects.toThrow("Sudah ada");
    await expect(sc.createKind(db, sup, projectId, { label: "vfx", color: 1 })).rejects.toThrow("Sudah ada");
    await expect(sc.createKind(db, sup, projectId, { label: "   ", color: 1 })).rejects.toThrow("wajib");
    await expect(sc.createKind(db, sup, projectId, { label: "x".repeat(25), color: 1 })).rejects.toThrow("24");
    const p2 = (await s.createProject(db, sup, { name: "Dua", productionType: "feature_theatrical", platforms: ["Bioskop"], unitCount: null })).id;
    for (let i = 1; i <= 12; i++) await sc.createKind(db, sup, p2, { label: `Jenis ${i}`, color: 1 });
    await expect(sc.createKind(db, sup, p2, { label: "Ketiga belas", color: 1 })).rejects.toThrow("Maksimal 12");
    expect((await sc.listKinds(db, projectId)).length).toBe(3); // per project
  });

  it("generates keys that start with c-, fold accents and never repeat", () => {
    expect(sc.kindKey("Clearance lagu", [])).toBe("c-clearance-lagu");
    expect(sc.kindKey("Stunt/SFX", [])).toBe("c-stunt-sfx");
    expect(sc.kindKey("Têks Åkhir Éclair!", [])).toBe("c-teks-akhir-eclair");
    expect(sc.kindKey("VFX", [])).toBe("c-vfx");
    expect(sc.kindKey("???", [])).toBe("c-jenis");
    expect(sc.kindKey("Subtitle", ["c-subtitle", "c-subtitle-2"])).toBe("c-subtitle-3");
    for (const k of TAG_KINDS) expect(isBuiltinKind(sc.kindKey(k, []))).toBe(false);
    expect(sc.cleanLabel("a\u0000b   \tc\n")).toBe("a b c");
  });

  it("tags a scene, a selection and several scenes with a custom kind; rejects unknown keys", async () => {
    const key = (await keyOf("Stock footage")).key;
    await sc.setTags(db, sup, projectId, [sceneIds[0]], { kind: key, note: "arsip" });
    await sc.addTagFromSelection(db, sup, projectId, sceneIds[1], key, "  gambar   arsip kota ");
    await sc.setTags(db, sup, projectId, [sceneIds[2], sceneIds[3]], { kind: key });
    const rows = await get();
    expect(rows[0].postTags.find((t) => t.kind === key)).toMatchObject({ note: "arsip", auto: false, itemId: null });
    expect(rows[1].postTags.find((t) => t.kind === key)).toMatchObject({ excerpt: "gambar arsip kota", auto: false });
    expect(rows.filter((r) => r.postTags.some((t) => t.kind === key)).length).toBe(4);
    await expect(sc.setTags(db, sup, projectId, [sceneIds[0]], { kind: "c-ghost" })).rejects.toThrow("tidak valid");
    await expect(sc.addTagFromSelection(db, sup, projectId, sceneIds[0], "c-ghost", "x")).rejects.toThrow("tidak valid");
    await expect(sc.setTags(db, sup, projectId, [sceneIds[0]], { kind: "toString" })).rejects.toThrow("tidak valid");
  });

  it("aggregates custom kinds in needs, CSV post and the phase view; defaultPhase and suggestions ignore them", async () => {
    const kinds = await sc.getKinds(db, projectId), key = "c-stock-footage";
    const rows = await get();
    const needs = postNeeds(rows, [], kinds);
    expect(needs.find((n) => n.kind === key)).toMatchObject({ label: "Stock footage", color: 5, scenes: 4 });
    expect(needs.map((n) => n.kind).indexOf(key)).toBeGreaterThan(needs.map((n) => n.kind).indexOf("vfx"));
    const csv = postCsvRows(rows, [], kinds);
    expect(csv.filter((r) => r[0] === "Stock footage").length).toBe(4);
    expect(csv.some((r) => r[0] === "c-stock-footage")).toBe(false);
    expect(Object.values(needsByPhase(rows.map((r) => ({ ...r, postTags: r.postTags.map((t) => ({ ...t, itemId: "p1" })) })), kinds)).flat().some((n) => n.label === "Stock footage")).toBe(true);
    expect(defaultPhase(key, [{ id: "1", name: "VFX" }])).toBeNull();
    expect(defaultPhase("c-x", [{ id: "1", name: "Sound" }])).toBeNull();
    const text = ["VFX CGI LEDAKAN LAGU HUJAN FLASHBACK SMS stock footage clearance lagu"];
    expect(suggestTags(text, ["BUDI (V.O.)"], ["halo"]).every((t) => isBuiltinKind(t.kind))).toBe(true);
    expect(sc.getPhaseNeeds).toBeTypeOf("function");
  });

  it("renders a tag whose kind was deleted by hand without throwing, under its own group", async () => {
    await db.update(scriptScenes).set({ postTags: [{ kind: "c-hilang-total", note: "", auto: false, excerpt: "x" }] }).where(eq(scriptScenes.id, sceneIds[10]));
    const kinds = await sc.getKinds(db, projectId);
    const rows = await get();
    expect(kindDef(kinds, "c-hilang-total")).toMatchObject({ label: "Hilang total", color: 0 });
    expect(postNeeds(rows, [], kinds).find((n) => n.kind === "c-hilang-total")).toMatchObject({ label: "Hilang total", scenes: 1 });
    expect(postCsvRows(rows, [], kinds).some((r) => r[0] === "Hilang total")).toBe(true);
    expect(() => needsByPhase(rows.map((r) => ({ ...r, postTags: r.postTags.map((t) => ({ ...t, itemId: "p" })) })), kinds)).not.toThrow();
    await sc.removeTag(db, sup, projectId, sceneIds[10], "c-hilang-total"); // still removable
    expect((await get())[10].postTags.some((t) => t.kind === "c-hilang-total")).toBe(false);
  });

  it("deleting a kind strips its tags project-wide and writes one audit entry", async () => {
    const k = await keyOf("Stock footage");
    expect((await sc.kindUsage(db, projectId))[k.key]).toBe(4);
    const before = (await db.select().from(auditLog).where(eq(auditLog.projectId, projectId))).length;
    expect(await sc.deleteKind(db, sup, projectId, k.id)).toEqual({ removed: 4 });
    const after = await db.select().from(auditLog).where(eq(auditLog.projectId, projectId));
    expect(after.length).toBe(before + 1);
    expect(after.at(-1)!.summary).toContain("4 tag");
    expect((await get()).some((r) => r.postTags.some((t) => t.kind === k.key))).toBe(false);
    expect((await sc.listKinds(db, projectId)).map((x) => x.label)).toEqual(["Subtitle", "Clearance lagu"]);
    await expect(sc.deleteKind(db, sup, projectId, k.id)).rejects.toThrow("tidak ditemukan");
  });

  it("keeps custom kinds out of view-only data", async () => {
    const { token } = await s.createShareLink(db, sup, projectId, "Klien");
    const text = JSON.stringify(await s.getViewerData(db, token));
    for (const w of ["Clearance lagu", "c-clearance-lagu", "script_tag_kinds", "postTags"]) expect(text).not.toContain(w);
  });
});
