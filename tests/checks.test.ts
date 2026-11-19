import { describe, expect, it } from "vitest";
import { createPgliteDb } from "@/db/client";
import { getPreset, resolveSpec } from "@/lib/deliverables/catalog";
import * as d from "@/lib/deliverables/service";
import { getChecks } from "@/lib/checks/service";
import { parseAspect, parseRes, runChecks, type CheckInput } from "@/lib/checks/rules";
import * as sch from "@/lib/schedule/service";
import * as s from "@/lib/services";

const del = (o: Partial<CheckInput["deliverables"][number]> = {}) => ({ id: "d", name: "X", platform: "Bioskop", trackId: null, spec: {}, dueDate: null, status: "not_started", origin: "delivered", presetId: null, presetVersion: null, ...o });
const run = (o: Partial<CheckInput>) => runChecks({ slug: "p", tech: {}, deliverables: [], items: [], today: "2026-11-18", ...o });
const ids = (o: Partial<CheckInput>) => run(o).map((f) => f.rule);

describe("checks", () => {
  it("parsers", () => {
    expect(parseRes("2048x858 (2K Scope)")).toEqual({ w: 2048, h: 858 });
    expect(parseRes("")).toBeNull();
    expect(parseAspect("2.39:1")).toBeCloseTo(2.39);
    expect(parseAspect("16:9")).toBeCloseTo(1.778, 2);
    expect(parseAspect("abc")).toBeNull();
    expect(parseAspect("1:0")).toBeNull();
  });
  it("empty fields give nothing", () => expect(run({})).toEqual([]));
  it("aspect.master", () => {
    expect(ids({ tech: { masterResolution: "1998x1080 (2K Flat)", aspectRatio: "1.85:1" } })).toEqual([]);
    expect(ids({ tech: { masterResolution: "2048x858 (2K Scope)", aspectRatio: "2.39:1" } })).toEqual([]);
    expect(ids({ tech: { masterResolution: "3840x2160 (UHD)", aspectRatio: "16:9" } })).toEqual([]);
    const f = run({ tech: { masterResolution: "2048x858 (2K Scope)", aspectRatio: "1.85:1" } });
    expect(f[0]).toMatchObject({ rule: "aspect.master", severity: "error" });
    expect(run({ tech: { masterResolution: "3840x2160 (UHD)", aspectRatio: "2.39:1" } })[0].severity).toBe("warn");
  });
  it("aspect.deliverable", () => {
    expect(ids({ deliverables: [del({ spec: { resolution: "1920x1080 (HD)", aspectRatio: "16:9" } })] })).toEqual([]);
    const f = run({ deliverables: [del({ spec: { resolution: "1920x1080 (HD)", aspectRatio: "2.39:1" } })] });
    expect(f[0]).toMatchObject({ rule: "aspect.deliverable", severity: "warn" });
    expect(f[0].detail).toMatch(/letterbox/i);
  });
  it("fps rules", () => {
    expect(ids({ tech: { frameRate: "24", sound_tc_fps: "23.976" } })).toEqual(["fps.sound"]);
    expect(ids({ tech: { frameRate: "29.97", sound_tc_fps: "29.97 NDF" } })).toEqual([]);
    expect(ids({ tech: { frameRate: "24", cam1_fps: "48", cam2_fps: "24", cam3_fps: "film" } })).toEqual(["fps.camera"]);
    expect(run({ tech: { frameRate: "24", sound_tc_fps: "23.976" } })[0].fix.href).toBe("/admin/p/p/technical#f-sound_tc_fps");
    expect(run({ tech: { frameRate: "24", cam2_fps: "48" } })[0].fix.href).toBe("/admin/p/p/technical#f-cam2_fps");
    const t = { frameRate: "24" };
    expect(ids({ tech: t, deliverables: [del({ spec: { frameRate: "23.976" } })] })).toEqual(["fps.deliverable"]);
    expect(ids({ tech: t, deliverables: [del({ spec: { frameRate: "24" } }), del({ spec: { frameRate: "25" }, status: "delivered" }), del({ spec: { frameRate: "25" }, origin: "derived" })] })).toEqual([]);
  });
  it("due.beforeFinish", () => {
    const items = [{ id: "1", name: "QC & Mastering", trackId: "t", trackName: "Film", parentId: null, dueDate: "2027-02-01" }];
    expect(ids({ items, deliverables: [del({ dueDate: "2027-01-01", trackId: "t" })] })).toEqual(["due.beforeFinish"]);
    expect(ids({ items, deliverables: [del({ dueDate: "2027-01-01", trackId: "other" })] })).toEqual([]);
    expect(ids({ items, deliverables: [del({ dueDate: "2027-01-01", status: "accepted" }), del({ dueDate: "2027-02-01" }), del()] })).toEqual([]);
  });
  it("preset deviation and version", () => {
    const p = getPreset("cinema")!;
    const item = p.items[0];
    const tech = { masterResolution: "4096x1716 (4K Scope)", aspectRatio: "2.39:1", frameRate: "24" };
    const ok = del({ name: item.name, presetId: "cinema", presetVersion: p.specVersion, spec: resolveSpec(item.spec, tech) });
    expect(ids({ tech, deliverables: [ok] })).toEqual([]);
    const bad = del({ ...ok, spec: { ...ok.spec, format: "MP4 H.264" }, presetVersion: "lama" });
    const f = run({ tech, deliverables: [bad] });
    expect(f.map((x) => x.rule).sort()).toEqual(["preset.deviation", "preset.version"]);
    expect(f.find((x) => x.rule === "preset.deviation")!.detail).toContain("format");
  });
  it("preset deviation ignores spec keys the deliverable does not have", () => {
    const p = getPreset("cinema")!;
    const item = p.items[0];
    const tech = { masterResolution: "4096x1716 (4K Scope)", aspectRatio: "2.39:1", frameRate: "24" };
    const old = del({ name: item.name, presetId: "cinema", presetVersion: p.specVersion, spec: {} });
    expect(ids({ tech, deliverables: [old] })).toEqual([]);
  });
  it("sorted by severity and a throwing rule does not hide others", () => {
    const f = run({ tech: { masterResolution: "2048x858 (2K Scope)", aspectRatio: "1.85:1", frameRate: "24", cam1_fps: "48" } });
    expect(f.map((x) => x.severity)).toEqual(["error", "info"]);
    const bad = { tech: { frameRate: "24", masterResolution: "2048x858 (2K Scope)", aspectRatio: "1.85:1" }, deliverables: [null as never] };
    expect(ids(bad)).toContain("aspect.master");
  });
  it("service on a seeded project", async () => {
    const db = await createPgliteDb();
    const u = (await s.createUser(db, { name: "Sup", email: "c@x.id", password: "password1" })).id;
    const pid = (await s.createProject(db, u, { name: "Film", productionType: "feature_theatrical", platforms: ["Bioskop"], unitCount: null })).id;
    await s.updateTechSpec(db, u, pid, { masterResolution: "2048x858 (2K Scope)", aspectRatio: "1.85:1" });
    await sch.addTrack(db, u, pid, { name: "Film", template: "feature", startDate: "2026-12-01" }).catch(() => undefined);
    await d.applyPreset(db, u, pid, { presetId: "promo", trackId: null, dueDate: "2026-12-02" });
    const f = await getChecks(db, pid, "film", "2026-11-18");
    expect(f[0]).toMatchObject({ rule: "aspect.master", severity: "error" });
    expect(f[0].fix.href).toBe("/admin/p/film/technical#f-masterResolution");
  });
});
