import { beforeAll, describe, expect, it } from "vitest";
import { createPgliteDb, type Db } from "@/db/client";
import { ForbiddenError } from "@/lib/auth/permissions";
import { applyAliases, nameKey, suggestPairs } from "@/lib/script/aliases";
import * as sc from "@/lib/script/service";
import * as s from "@/lib/services";

const scene = (n: number, location: string, chars: [string, number][]) => ({ number: String(n), heading: `INT. ${location} - SIANG`, intExt: "INT", location, timeOfDay: "SIANG", pageStart: n, pageEnd: n, lines: 5, estSeconds: 60, characters: chars.map(([name, blocks]) => ({ name, blocks })), postTags: [], blocks: [] });
const scenes = [
  scene(1, "RUMAH BUDI - RUANG TAMU", [["BUDI", 3], ["SITI", 1]]),
  scene(2, "RUMAH BUDI", [["BUDL", 2], ["BUDI", 1]]),
  scene(3, "RUMAH BUDHI", [["BUDI.", 4], ["SITI", 2]]),
  scene(4, "PASAR", [["SITI", 1]]),
];

describe("script aliases", () => {
  let db: Db, sup: string, asst: string, projectId: string, scriptId: string;
  const get = () => sc.getScript(db, projectId, scriptId).then((d) => d!);
  const chars = async () => Object.fromEntries((await get()).aggregate.characters.map((c) => [c.name, [c.scenes, c.blocks]]));
  beforeAll(async () => {
    db = await createPgliteDb();
    sup = (await s.createUser(db, { name: "Sup", email: "sup@x.id", password: "password1" })).id;
    projectId = (await s.createProject(db, sup, { name: "Film", productionType: "feature_theatrical", platforms: ["Bioskop"], unitCount: null })).id;
    await s.addMember(db, sup, projectId, { email: "asst@x.id", role: "assistant", name: "Asst", password: "password1" });
    asst = (await s.listMembers(db, projectId)).find((m) => m.role === "assistant")!.userId;
    scriptId = (await sc.importScript(db, sup, projectId, { title: "T", sourceName: "t.pdf", pages: 4, scenes })).scriptId;
  });

  it("merges, flattens chains, and unmerge restores", async () => {
    expect(await chars()).toMatchObject({ BUDI: [2, 4], BUDL: [1, 2], "BUDI.": [1, 4] });
    await sc.mergeNames(db, sup, projectId, scriptId, "character", ["BUDL", "BUDI."], "BUDI");
    expect(await chars()).toEqual({ BUDI: [3, 10], SITI: [3, 4] });
    // BUDI itself merges into a new typed name: BUDL and BUDI. must follow, never chain
    await sc.mergeNames(db, sup, projectId, scriptId, "character", ["BUDI"], "BUDI SANTOSO");
    const al = (await get()).aliases.filter((a) => a.kind === "character");
    expect(al.map((a) => a.toName)).toEqual(Array(3).fill("BUDI SANTOSO"));
    expect(await chars()).toEqual({ "BUDI SANTOSO": [3, 10], SITI: [3, 4] });
    await sc.unmerge(db, sup, projectId, scriptId, "character", "BUDL");
    expect((await chars()).BUDL).toEqual([1, 2]);
    // choosing a merged-away name as main un-aliases it
    await sc.mergeNames(db, sup, projectId, scriptId, "character", ["BUDI SANTOSO"], "BUDI");
    expect((await chars()).BUDI).toEqual([3, 8]);
    expect((await get()).aliases.some((a) => a.fromName === "BUDI" && a.kind === "character")).toBe(false);
  });

  it("merges locations by place and keeps the suffix; stored scenes are untouched", async () => {
    await sc.mergeNames(db, sup, projectId, scriptId, "location", ["RUMAH BUDHI"], "RUMAH BUDI");
    const d = await get();
    expect(d.aggregate.locations.find((l) => l.place === "RUMAH BUDI")).toMatchObject({ scenes: 3, sceneNumbers: ["1", "2", "3"] });
    expect(d.scenes[0].location).toBe("RUMAH BUDI - RUANG TAMU");
    await expect(sc.mergeNames(db, sup, projectId, scriptId, "location", ["PASAR"], "A - B")).rejects.toThrow();
    const raw = applyAliases(scenes, []);
    expect(raw[2].location).toBe("RUMAH BUDHI");
  });

  it("validates, supervisor-only, assistant reads merged view, audit has no names", async () => {
    await expect(sc.mergeNames(db, asst, projectId, scriptId, "character", ["SITI"], "X")).rejects.toBeInstanceOf(ForbiddenError);
    await expect(sc.unmerge(db, asst, projectId, scriptId, "character", "BUDL")).rejects.toBeInstanceOf(ForbiddenError);
    await expect(sc.mergeNames(db, sup, projectId, scriptId, "character", ["SITI"], "")).rejects.toThrow();
    await expect(sc.mergeNames(db, sup, projectId, scriptId, "character", ["SITI"], "X".repeat(61))).rejects.toThrow();
    await expect(sc.mergeNames(db, sup, projectId, scriptId, "character", ["SITI"], "SITI")).rejects.toThrow();
    expect((await get()).aggregate.locations.some((l) => l.place === "RUMAH BUDHI")).toBe(false);
    const log = (await s.listActivity(db, projectId)).filter((a) => a.entry.entity === "script").map((a) => a.entry.summary);
    expect(log).toContain("Menggabungkan 3 karakter");
    expect(log.filter((l) => /BUDI|BUDL|SITI|RUMAH/.test(l.replace("Mengimpor", "")) && !l.startsWith("Mengimpor"))).toEqual([]);
  });

  it("limits aliases per script", async () => {
    const many = Array.from({ length: 501 }, (_, i) => `N${i}`);
    await expect(sc.mergeNames(db, sup, projectId, scriptId, "character", many, "TOP")).rejects.toThrow(/500/);
  });
});

describe("suggestions", () => {
  const p = (names: string[], kind: "character" | "location" = "character") => suggestPairs(names.map((name, i) => ({ name, scenes: 10 - i })), kind);
  it("finds typos, variants and prefixes", () => {
    expect(nameKey("BUDI (V.O.)")).toBe(nameKey("budi"));
    expect(p(["BUDI", "BUDl"])).toEqual([["BUDI", "BUDl"]]);
    expect(p(["BUDI", "BUDI (V.O.)"])).toHaveLength(1);
    expect(p(["SANTOSO", "SANTOS0"])).toHaveLength(1);
    expect(p(["SANTOSO", "SANTOSA"])).toHaveLength(1);
    expect(p(["RUMAH BUDI", "RUMAH BUDI RUANG TAMU"], "location")).toHaveLength(1);
    expect(p(["ANA", "ANI"])).toEqual([]); // too short for distance matching
    expect(p(["BUDI", "SITI", "RINA"])).toEqual([]);
  });
});
