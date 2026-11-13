import { beforeAll, describe, expect, it } from "vitest";
import { createPgliteDb, type Db } from "@/db/client";
import { ForbiddenError } from "@/lib/auth/permissions";
import * as f from "@/lib/feedback/service";
import * as sch from "@/lib/schedule/service";
import * as s from "@/lib/services";

const it_ = (id: string, parentId: string | null, startDate: string, n = 0) => ({ id, parentId, startDate, createdAt: new Date(2026, 0, 1, 0, 0, n) });
const pt = (id: string, itemId: string, status = "open", checkedItemId: string | null = null, n = 0) => ({ id, itemId, status, checkedItemId, sortOrder: n, createdAt: new Date(2026, 0, 1, 0, 0, n) });

describe("parsePoints", () => {
  it("splits lines, strips bullets, extracts refs", () => {
    expect(f.parsePoints("- satu\n\n• dua\n1. tiga\n2) empat\n[R2 00:14:32] lima\n00:14:32 enam\n01:02:03:12 tujuh\n12:30pm")).toEqual([
      { ref: "", body: "satu" }, { ref: "", body: "dua" }, { ref: "", body: "tiga" }, { ref: "", body: "empat" },
      { ref: "R2 00:14:32", body: "lima" }, { ref: "00:14:32", body: "enam" }, { ref: "01:02:03:12", body: "tujuh" }, { ref: "", body: "12:30pm" },
    ]);
  });
});

describe("carryOver", () => {
  const items = [it_("ph", null, "2026-01-01"), it_("a", "ph", "2026-01-05"), it_("b", "ph", "2026-01-10"), it_("c", "ph", "2026-01-10", 5), it_("other", "ph2", "2026-01-01")];
  const points = [pt("p1", "a", "open", null, 1), pt("p2", "a", "fixed", "b", 2), pt("p3", "b", "open", null, 3), pt("p4", "other"), pt("p5", "a", "dropped", "b", 4)];
  it("open earlier points plus those checked here", () => {
    expect(f.carryOver(items, points, "b").map((p) => p.id)).toEqual(["p1", "p2", "p5"]);
    expect(f.carryOver(items, points, "c").map((p) => p.id)).toEqual(["p1", "p3"]); // same date, later created: b is earlier
    expect(f.carryOver(items, points, "a")).toEqual([]);
    expect(f.carryOver(items, points, "ph")).toEqual([]);
  });
});

describe("feedback points", () => {
  let db: Db, sup: string, asst: string, projectId: string, id: (n: string) => string;
  beforeAll(async () => {
    db = await createPgliteDb();
    sup = (await s.createUser(db, { name: "Sup", email: "sup@x.id", password: "password1" })).id;
    projectId = (await s.createProject(db, sup, { name: "Film", productionType: "feature_theatrical", platforms: [], unitCount: null })).id;
    await s.addMember(db, sup, projectId, { email: "asst@x.id", role: "assistant", name: "Asst", password: "password1" });
    asst = (await s.listMembers(db, projectId)).find((m) => m.role === "assistant")!.userId;
    await sch.addTrack(db, sup, projectId, { name: "", template: "feature", startDate: "2026-12-01" });
    const items = (await sch.getSchedule(db, projectId, { includeInternal: true })).tracks[0].items;
    id = (n: string) => items.find((i) => i.name === n)!.id;
  });

  it("add, check, carry over, delete", async () => {
    expect(await f.addPoints(db, asst, projectId, id("Preview 1"), { text: "- [R1 00:01:00] potong adegan 3\nganti musik\nperbaiki warna", fromWho: "Director" })).toBe(3);
    const mine = (await f.listPoints(db, projectId, { includeInternal: true })).filter((p) => p.itemId === id("Preview 1"));
    expect(mine.map((p) => p.ref)).toEqual(["R1 00:01:00", "", ""]);
    await f.checkPoint(db, asst, projectId, mine[0].id, { status: "fixed", checkedItemId: id("Preview 2"), note: "ok" });
    const all = await f.listPoints(db, projectId, { includeInternal: true });
    const items = (await sch.getSchedule(db, projectId, { includeInternal: true })).tracks[0].items;
    const at2 = f.carryOver(items, all, id("Preview 2"));
    expect(at2).toHaveLength(3);
    expect(at2.filter((p) => p.status === "fixed")).toHaveLength(1);
    expect(f.carryOver(items, all, id("Producer Session"))).toHaveLength(2);
    await f.checkPoint(db, sup, projectId, mine[0].id, { status: "open", checkedItemId: null, note: "" });
    expect((await f.listPoints(db, projectId, { includeInternal: true })).find((p) => p.id === mine[0].id)).toMatchObject({ status: "open", checkedItemId: null });
    await expect(f.deletePoint(db, asst, projectId, mine[1].id)).rejects.toBeInstanceOf(ForbiddenError);
    await expect(f.addPoints(db, sup, projectId, id("Preview 1"), { text: " \n " })).rejects.toBeInstanceOf(s.InputError);
    await sch.deleteItem(db, sup, projectId, id("Preview 1"));
    expect(await f.listPoints(db, projectId, { includeInternal: true })).toEqual([]);
  });

  it("restoring a version drops points of items that no longer exist", async () => {
    await sch.saveVersion(db, sup, projectId, "Sebelum");
    await sch.addItem(db, sup, projectId, { trackId: (await sch.getSchedule(db, projectId, { includeInternal: true })).tracks[0].id, parentId: id("Offline Edit"), name: "Extra", startDate: "2026-12-20", dueDate: "2026-12-20" });
    const extra = (await sch.getSchedule(db, projectId, { includeInternal: true })).tracks[0].items.find((i) => i.name === "Extra")!.id;
    await f.addPoints(db, sup, projectId, extra, { text: "satu" });
    const [v] = await sch.listVersions(db, projectId);
    await sch.restoreVersion(db, sup, projectId, v.id);
    expect(await f.listPoints(db, projectId, { includeInternal: true })).toEqual([]);
  });
});
