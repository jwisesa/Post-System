import { beforeAll, describe, expect, it } from "vitest";
import { createPgliteDb, type Db } from "@/db/client";
import { ForbiddenError } from "@/lib/auth/permissions";
import { addDays, diffDays } from "@/lib/schedule/dates";
import * as sch from "@/lib/schedule/service";
import { computeShift, wouldCycle, type SItem } from "@/lib/schedule/shift";
import * as s from "@/lib/services";

const item = (id: string, startDate: string, dueDate: string, extra: Partial<SItem> = {}): SItem => ({ id, name: id, parentId: null, startDate, dueDate, hardDeadline: false, ...extra });

describe("computeShift", () => {
  // lock -> grade -> online -> delivery(hard); lock -> mix; milestone inside grade
  const items = [
    item("lock", "2026-12-01", "2026-12-01"),
    item("grade", "2026-12-02", "2026-12-10"),
    item("review", "2026-12-05", "2026-12-05", { parentId: "grade" }),
    item("mix", "2026-12-02", "2026-12-20"),
    item("online", "2026-12-11", "2026-12-15"),
    item("delivery", "2026-12-18", "2026-12-18", { hardDeadline: true }),
  ];
  const deps = [
    { itemId: "grade", dependsOnId: "lock" },
    { itemId: "mix", dependsOnId: "lock" },
    { itemId: "online", dependsOnId: "grade" },
    { itemId: "delivery", dependsOnId: "online" },
  ];
  const get = (r: ReturnType<typeof computeShift>, id: string) => r.moves.find((m) => m.id === id);

  it("cascades the due-date delta through dependents and their milestones", () => {
    const r = computeShift(items, deps, "lock", "2026-12-04", "2026-12-04", true);
    expect(r.moves.map((m) => m.id).sort()).toEqual(["grade", "lock", "mix", "online", "review"]);
    expect(get(r, "grade")).toMatchObject({ newStart: "2026-12-05", newDue: "2026-12-13" });
    expect(get(r, "review")!.newStart).toBe("2026-12-08");
    expect(get(r, "online")!.newDue).toBe("2026-12-18");
  });

  it("never moves a hard deadline and reports the collision", () => {
    const r = computeShift(items, deps, "lock", "2026-12-04", "2026-12-04", true);
    expect(get(r, "delivery")).toBeUndefined();
    expect(r.conflicts).toHaveLength(1);
    expect(r.conflicts[0]).toContain("hard deadline");
  });

  it("no conflict when the slip still fits before the hard deadline", () => {
    expect(computeShift(items, deps, "lock", "2026-12-02", "2026-12-02", true).conflicts).toEqual([]);
  });

  it("without cascade only the item moves, and overlaps are reported", () => {
    const r = computeShift(items, deps, "lock", "2026-12-01", "2026-12-03", false);
    expect(r.moves.map((m) => m.id)).toEqual(["lock"]);
    expect(r.conflicts).toHaveLength(2); // grade and mix start on 2 Dec
  });

  it("extending only the due date leaves the item's own milestones alone", () => {
    const r = computeShift(items, deps, "grade", "2026-12-02", "2026-12-12", true);
    expect(get(r, "review")).toBeUndefined();
    expect(get(r, "online")!.newStart).toBe("2026-12-13");
  });

  it("pulling earlier works; unchanged dates are a no-op; bad ranges throw", () => {
    expect(get(computeShift(items, deps, "grade", "2026-12-02", "2026-12-08", true), "online")!.newStart).toBe("2026-12-09");
    expect(computeShift(items, deps, "grade", "2026-12-02", "2026-12-10", true).moves).toEqual([]);
    expect(() => computeShift(items, deps, "grade", "2026-12-12", "2026-12-10", true)).toThrow();
  });

  it("detects dependency loops", () => {
    expect(wouldCycle(deps, "lock", "online")).toBe(true);
    expect(wouldCycle(deps, "lock", "lock")).toBe(true);
    expect(wouldCycle(deps, "mix", "online")).toBe(false);
  });
});

describe("schedule service", () => {
  let db: Db, sup: string, asst: string, projectId: string;
  const find = async (name: string, track = "Main Feature") =>
    (await sch.getSchedule(db, projectId, { includeInternal: true })).tracks.find((t) => t.name === track)!.items.find((i) => i.name === name)!;

  beforeAll(async () => {
    db = await createPgliteDb();
    sup = (await s.createUser(db, { name: "Sup", email: "sup@x.id", password: "password1" })).id;
    projectId = (await s.createProject(db, sup, { name: "Film", productionType: "feature_theatrical", platforms: [], unitCount: null })).id;
    await s.addMember(db, sup, projectId, { email: "asst@x.id", role: "assistant", name: "Asst", password: "password1" });
    asst = (await s.listMembers(db, projectId)).find((m) => m.role === "assistant")!.userId;
    await sch.addTrack(db, sup, projectId, { name: "", template: "feature", startDate: "2026-12-01" });
    await sch.addTrack(db, sup, projectId, { name: "Trailer", template: "promo", startDate: "2026-12-10" });
  });

  it("templates seed chained phases with baselines; tracks run in parallel", async () => {
    const { tracks, deps } = await sch.getSchedule(db, projectId, { includeInternal: true });
    expect(tracks.map((t) => t.name)).toEqual(["Main Feature", "Trailer"]);
    const [ingest, offline] = tracks[0].items;
    expect(offline.startDate).toBe(addDays(ingest.dueDate, 1));
    expect(offline.baselineDue).toBe(offline.dueDate);
    const online = tracks[0].items.find((i) => i.name === "Online / Conform")!;
    const vfx = tracks[0].items.find((i) => i.name === "VFX")!;
    expect(online.startDate).toBe(addDays(vfx.dueDate, 1)); // waits for the longest predecessor
    expect(deps.length).toBeGreaterThan(10);
    // the trailer delivers long before the feature
    expect(tracks[1].items.at(-1)!.dueDate < tracks[0].items.at(-1)!.dueDate).toBe(true);
  });

  it("preview changes nothing; apply shifts dependents, keeps baseline, logs one entry", async () => {
    const lock = await find("Picture Lock");
    const delivery = await find("Delivery");
    const input = { startDate: addDays(lock.startDate, 3), dueDate: addDays(lock.dueDate, 3), cascade: true };
    const preview = await sch.previewShift(db, sup, projectId, lock.id, input);
    expect(preview.moves.length).toBe(9); // lock + 8 downstream phases
    expect((await find("Delivery")).dueDate).toBe(delivery.dueDate);

    await sch.applyShift(db, sup, projectId, lock.id, input, "director minta tambahan waktu");
    const moved = await find("Delivery");
    expect(diffDays(delivery.dueDate, moved.dueDate)).toBe(3);
    expect(moved.baselineDue).toBe(delivery.dueDate);
    expect((await find("Offline Edit")).dueDate).toBe(addDays(lock.startDate, -1)); // upstream untouched
    expect((await find("Delivery", "Trailer")).dueDate).toBe((await find("Delivery", "Trailer")).baselineDue); // other track untouched

    const [{ entry }] = await s.listActivity(db, projectId);
    expect(entry.summary).toContain("menggeser 8 item lain");
    expect(entry.reason).toBe("director minta tambahan waktu");
    expect(Object.keys(entry.after as object)).toContain("Main Feature / Delivery");
  });

  it("hard deadline stays put and the conflict is returned", async () => {
    const delivery = await find("Delivery");
    await sch.updateItemDetails(db, sup, projectId, delivery.id, { name: "Delivery", picContactId: null, hardDeadline: true, internal: false });
    const qc = await find("QC");
    const r = await sch.applyShift(db, sup, projectId, qc.id, { startDate: qc.startDate, dueDate: addDays(qc.dueDate, 10), cascade: true });
    expect(r.conflicts.length).toBe(1);
    expect((await find("Delivery")).dueDate).toBe(delivery.dueDate);
  });

  it("rebaseline resets slip", async () => {
    await sch.rebaseline(db, sup, projectId);
    const qc = await find("QC");
    expect(qc.baselineDue).toBe(qc.dueDate);
  });

  it("milestones, dependency loops, and cross-track links", async () => {
    const offline = await find("Offline Edit");
    await sch.addItem(db, sup, projectId, { trackId: offline.trackId, parentId: offline.id, name: "Cut v1 ke director", startDate: addDays(offline.startDate, 14), dueDate: "" });
    const ms = await find("Cut v1 ke director");
    expect(ms.dueDate).toBe(ms.startDate);
    const ingest = await find("Ingest & Sync");
    await expect(sch.addDependency(db, sup, projectId, ingest.id, offline.id)).rejects.toBeInstanceOf(s.InputError);
    // trailer edit waits for the feature's offline cut
    const trailerEdit = await find("Edit", "Trailer");
    await sch.addDependency(db, sup, projectId, trailerEdit.id, offline.id);
    const r = await sch.previewShift(db, sup, projectId, offline.id, { startDate: offline.startDate, dueDate: addDays(offline.dueDate, 2), cascade: true });
    expect(r.moves.some((m) => m.id === trailerEdit.id)).toBe(true);
  });

  it("assistant can update status but not dates or structure", async () => {
    const offline = await find("Offline Edit");
    await sch.setItemStatus(db, asst, projectId, offline.id, { status: "in_progress", notes: "reel 1-3 selesai" });
    expect((await find("Offline Edit")).status).toBe("in_progress");
    await expect(sch.applyShift(db, asst, projectId, offline.id, { startDate: offline.startDate, dueDate: addDays(offline.dueDate, 1), cascade: true })).rejects.toBeInstanceOf(ForbiddenError);
    await expect(sch.addTrack(db, asst, projectId, { name: "X", template: "empty", startDate: "" })).rejects.toBeInstanceOf(ForbiddenError);
    await expect(sch.setItemStatus(db, asst, projectId, offline.id, { status: "bogus", notes: "" })).rejects.toBeInstanceOf(s.InputError);
  });

  it("applyMoves restores exact dates (undo) and is supervisor-only; overview counts", async () => {
    const qc = await find("QC");
    const mastering = await find("Mastering");
    const r = await sch.applyShift(db, sup, projectId, qc.id, { startDate: qc.startDate, dueDate: addDays(qc.dueDate, 2), cascade: true });
    expect((await find("Mastering")).startDate).toBe(addDays(mastering.startDate, 2));
    const undo = r.moves.map((m) => ({ id: m.id, startDate: m.oldStart, dueDate: m.oldDue }));
    await expect(sch.applyMoves(db, asst, projectId, undo, "x")).rejects.toBeInstanceOf(ForbiddenError);
    await sch.applyMoves(db, sup, projectId, undo, "Mengurungkan perubahan jadwal");
    expect((await find("Mastering")).startDate).toBe(mastering.startDate);
    expect((await find("QC")).dueDate).toBe(qc.dueDate);
    expect((await s.listActivity(db, projectId))[0].entry.summary).toBe("Mengurungkan perubahan jadwal");

    const o = (await sch.getProjectsOverview(db, [projectId], "2027-01-01")).get(projectId)!;
    expect(o.total).toBeGreaterThan(15);
    expect(o.late).toBeGreaterThan(0); // Ingest & Sync was due in December
    expect(o.next!.dueDate >= "2027-01-01").toBe(true);
    await sch.setItemStatus(db, asst, projectId, qc.id, { status: "review" }); // notes omitted = kept
    expect((await find("QC")).status).toBe("review");
  });

  it("internal items and their milestones are hidden from viewers", async () => {
    const offline = await find("Offline Edit");
    await sch.updateItemDetails(db, sup, projectId, offline.id, { name: "Offline Edit", picContactId: null, hardDeadline: false, internal: true });
    const link = await s.createShareLink(db, sup, projectId, "Producer");
    const view = await s.getViewerData(db, link.token);
    const names = view!.schedule.tracks.flatMap((t) => t.items.map((i) => i.name));
    expect(names).toContain("Picture Lock");
    expect(names).not.toContain("Offline Edit");
    expect(names).not.toContain("Cut v1 ke director");
    const ids = new Set(view!.schedule.tracks.flatMap((t) => t.items.map((i) => i.id)));
    expect(view!.schedule.deps.every((d) => ids.has(d.itemId) && ids.has(d.dependsOnId))).toBe(true);
  });
});
