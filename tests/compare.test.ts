import { beforeAll, describe, expect, it } from "vitest";
import { createPgliteDb, type Db } from "@/db/client";
import type { ScheduleSnapshot } from "@/db/schema";
import { diffSnapshots, signedWorkDays } from "@/lib/schedule/compare";
import { addDays } from "@/lib/schedule/dates";
import * as sch from "@/lib/schedule/service";
import { calOf } from "@/lib/schedule/workdays";
import * as s from "@/lib/services";

const cal = calOf({ skipWeekends: true, national: false });
const it_ = (id: string, trackId: string, name: string, startDate: string, dueDate: string, parentId: string | null = null) =>
  ({ id, trackId, parentId, name, startDate, dueDate, baselineStart: startDate, baselineDue: dueDate, status: "not_started", picContactId: null, hardDeadline: false, internal: false, notes: "", color: null }) as ScheduleSnapshot["items"][number];
const snap = (tracks: string[], items: ScheduleSnapshot["items"]): ScheduleSnapshot => ({ tracks: tracks.map((id, n) => ({ id, name: id, sortOrder: n })), items, deps: [] });

describe("signedWorkDays", () => {
  it("counts across a weekend in both directions", () => {
    expect(signedWorkDays(cal, "2026-12-04", "2026-12-07")).toBe(1); // Fri -> Mon
    expect(signedWorkDays(cal, "2026-12-07", "2026-12-04")).toBe(-1);
    expect(signedWorkDays(cal, "2026-12-04", "2026-12-04")).toBe(0);
    expect(signedWorkDays(cal, "2026-12-04", "2026-12-11")).toBe(5);
  });
});

describe("diffSnapshots", () => {
  const a = snap(["t1", "gone"], [it_("p1", "t1", "Edit", "2026-12-07", "2026-12-11"), it_("m1", "t1", "Review", "2026-12-10", "2026-12-10", "p1"), it_("p2", "t1", "Mix", "2026-12-14", "2026-12-15"), it_("p3", "t1", "Grade", "2026-12-14", "2026-12-15"), it_("g1", "gone", "Old", "2026-12-14", "2026-12-14")]);
  const b = snap(["t1"], [it_("p1", "t1", "Edit", "2026-12-09", "2026-12-14"), it_("m1", "t1", "Review", "2026-12-10", "2026-12-10", "p1"), it_("p3", "t1", "Color", "2026-12-14", "2026-12-15"), it_("p4", "t1", "New", "2026-12-16", "2026-12-16")]);
  const rows = diffSnapshots(a, b, cal);
  const get = (id: string) => rows.find((r) => r.id === id)!;

  it("classifies and measures", () => {
    expect(get("p1")).toMatchObject({ kind: "changed", dStart: 2, dDue: 1 });
    expect(get("m1").kind).toBe("same");
    expect(get("p3")).toMatchObject({ kind: "renamed", oldName: "Grade", name: "Color", dStart: 0 });
    expect(get("p4")).toMatchObject({ kind: "added", now: { start: "2026-12-16", due: "2026-12-16" } });
    expect(get("p2").kind).toBe("removed");
  });
  it("orders b's tracks first, then a-only tracks, milestones under phases", () => {
    expect(rows.map((r) => r.id)).toEqual(["p1", "m1", "p2", "p3", "p4", "g1"]);
    expect(rows.at(-1)).toMatchObject({ id: "g1", kind: "removed", track: "gone" });
    expect(rows.slice(0, 2).map((r) => r.id)).toEqual(["p1", "m1"]);
  });
  it("same snapshot gives only same; empty gives nothing", () => {
    expect(diffSnapshots(a, a, cal).every((r) => r.kind === "same")).toBe(true);
    expect(diffSnapshots(snap([], []), snap([], []), cal)).toEqual([]);
  });
});

describe("getComparison", () => {
  let db: Db, sup: string, pid: string, other: string;
  beforeAll(async () => {
    db = await createPgliteDb();
    sup = (await s.createUser(db, { name: "Sup", email: "sup@x.id", password: "password1" })).id;
    pid = (await s.createProject(db, sup, { name: "A", productionType: "feature_theatrical", platforms: [], unitCount: null })).id;
    other = (await s.createProject(db, sup, { name: "B", productionType: "feature_theatrical", platforms: [], unitCount: null })).id;
    await sch.addTrack(db, sup, pid, { name: "", template: "feature", startDate: "2026-12-01" });
    await sch.saveVersion(db, sup, other, "Lain");
    await sch.saveVersion(db, sup, pid, "V1");
  });
  it("saved version vs now after applyMoves; foreign version rejected; empty both sides", async () => {
    const [v] = await sch.listVersions(db, pid);
    const first = (await sch.getSchedule(db, pid, { includeInternal: true })).tracks[0].items[0];
    await sch.applyMoves(db, sup, pid, [{ id: first.id, startDate: addDays(first.startDate, 7), dueDate: addDays(first.dueDate, 7) }], "geser");
    const c = await sch.getComparison(db, pid, v.id, "now");
    expect(c.a.label).toBe("V1");
    expect(c.b.label).toBe("Sekarang");
    expect(c.rows.find((r) => r.id === first.id)!.kind).toBe("changed");
    expect(c.rows.filter((r) => r.kind !== "same")).toHaveLength(1);
    const [lain] = await sch.listVersions(db, other);
    await expect(sch.getComparison(db, pid, lain.id, "now")).rejects.toBeInstanceOf(s.InputError);
    const e = await s.createProject(db, sup, { name: "E", productionType: "feature_theatrical", platforms: [], unitCount: null });
    expect((await sch.getComparison(db, e.id, "now", "now")).rows).toEqual([]);
  });
});
