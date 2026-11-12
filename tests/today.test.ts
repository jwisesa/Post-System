import { eq } from "drizzle-orm";
import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import { createPgliteDb, type Db } from "@/db/client";
import { scheduleItems } from "@/db/schema";
import * as a from "@/lib/assets/service";
import { ForbiddenError } from "@/lib/auth/permissions";
import * as d from "@/lib/deliverables/service";
import { addDays, today as todayWib } from "@/lib/schedule/dates";
import * as sch from "@/lib/schedule/service";
import * as s from "@/lib/services";
import { getToday, getWeeklyReport, SOON_DAYS, STALE_DAYS } from "@/lib/today/service";

const TODAY = "2027-01-15";

describe("today dashboard", () => {
  let db: Db, sup: string, asst: string, outsider: string, projectId: string;
  const id = new Map<string, string>();
  const names = (list: { name: string }[]) => list.map((x) => x.name);
  const setUpdated = (name: string, iso: string) => db.update(scheduleItems).set({ updatedAt: new Date(iso) }).where(eq(scheduleItems.id, id.get(name)!));
  const admin = () => getToday(db, projectId, TODAY, { includeInternal: true });

  beforeAll(async () => {
    db = await createPgliteDb();
    sup = (await s.createUser(db, { name: "Sup", email: "sup@x.id", password: "password1" })).id;
    outsider = (await s.createUser(db, { name: "Out", email: "out@x.id", password: "password1" })).id;
    projectId = (await s.createProject(db, sup, { name: "Film", productionType: "feature_theatrical", platforms: [], unitCount: null })).id;
    await s.addMember(db, sup, projectId, { email: "asst@x.id", role: "assistant", name: "Asst", password: "password1" });
    asst = (await s.listMembers(db, projectId)).find((m) => m.role === "assistant")!.userId;

    // Offline Edit is due TODAY+3 and Picture Lock TODAY+4; Ingest & Sync is long past.
    await sch.addTrack(db, sup, projectId, { name: "Main Feature", template: "empty", startDate: "" });
    const trackId = (await sch.getSchedule(db, projectId, { includeInternal: true })).tracks[0].id;
    const phase = (name: string, from: number, to: number) => sch.addItem(db, sup, projectId, { trackId, parentId: null, name, startDate: addDays(TODAY, from), dueDate: addDays(TODAY, to) });
    await phase("Ingest & Sync", -45, -39);
    await phase("Offline Edit", -38, 3);
    await phase("Picture Lock", 4, 4);
    await phase("Grading", 5, 18);
    await sch.addItem(db, sup, projectId, { trackId, parentId: null, name: "Review hari ini", startDate: TODAY, dueDate: TODAY });
    await sch.addItem(db, sup, projectId, { trackId, parentId: null, name: "Internal check", startDate: addDays(TODAY, 2), dueDate: addDays(TODAY, 2) });
    for (const i of (await sch.getSchedule(db, projectId, { includeInternal: true })).tracks[0].items) id.set(i.name, i.id);

    const [group] = await s.getTeam(db, projectId, { includeInternal: true });
    const contact = { groupId: group.id, jobTitle: "", company: "", needsAccess: false, isContact: false, isPic: true, notes: "" };
    await s.addContact(db, sup, projectId, { ...contact, name: "Budi", email: "budi@x.id", phone: "0811", internal: false });
    await s.addContact(db, sup, projectId, { ...contact, name: "Rahasia", email: "secret@x.id", phone: "0899", internal: true });
    const people = (await s.getTeam(db, projectId, { includeInternal: true })).flatMap((g) => g.contacts);
    const budi = people.find((c) => c.name === "Budi")!.id;
    const secret = people.find((c) => c.name === "Rahasia")!.id;
    const details = (name: string, over: Partial<sch.ItemDetails>) => sch.updateItemDetails(db, sup, projectId, id.get(name)!, { name, picContactId: null, hardDeadline: false, internal: false, ...over });
    await details("Ingest & Sync", { picContactId: budi });
    await details("Offline Edit", { picContactId: secret });
    await details("Picture Lock", { hardDeadline: true });
    await details("Internal check", { internal: true });

    const manual = (name: string, extra: Partial<d.DeliverableInput> = {}): d.DeliverableInput =>
      ({ name, platform: "YouTube", groupName: "", trackId: null, spec: {}, origin: "delivered", dueDate: null, notes: "", internal: false, ...extra });
    await d.addDeliverable(db, sup, projectId, manual("Trailer 30s", { dueDate: addDays(TODAY, 2) }));
    await d.addDeliverable(db, sup, projectId, manual("Poster", { dueDate: addDays(TODAY, -1) }));
    await d.addDeliverable(db, sup, projectId, manual("Rahasia cut", { dueDate: addDays(TODAY, 1), internal: true }));
    await d.addDeliverable(db, sup, projectId, manual("Derived thumb", { origin: "derived", dueDate: addDays(TODAY, 1) }));
    const poster = (await d.listDeliverables(db, projectId, { includeInternal: true })).find((x) => x.name === "Poster")!;
    await d.setDeliverableStatus(db, sup, projectId, poster.id, "delivered");

    const link = (targetId: string, label: string): a.NewAttachment => ({ targetType: "schedule_item", targetId, kind: "preview", label, url: "https://example.com/x", notes: "", internal: false });
    await a.addAttachment(db, sup, projectId, link(id.get("Offline Edit")!, "Cut A"));
    await a.addAttachment(db, sup, projectId, link(id.get("Picture Lock")!, "Lock cut"));
    await a.addAttachment(db, sup, projectId, link(id.get("Internal check")!, "Hidden cut"));
    const lock = (await a.listAttachments(db, projectId, { includeInternal: true })).find((x) => x.label === "Lock cut")!;
    await a.setVersionStatus(db, sup, projectId, lock.versions[0].id, "approved");

    // Everything was just created in the real clock; pin updated_at relative to TODAY.
    for (const name of id.keys()) await setUpdated(name, `${addDays(TODAY, -1)}T05:00:00Z`);
    await setUpdated("Ingest & Sync", `${addDays(TODAY, -10)}T05:00:00Z`);
  });

  it("groups unfinished work by due date", async () => {
    expect(SOON_DAYS).toBe(7);
    expect(STALE_DAYS).toBe(3);
    const t = await admin();
    expect(names(t.dueToday)).toEqual(["Review hari ini"]);
    expect(names(t.late)).toEqual(["Ingest & Sync"]);
    expect(names(t.next7)).toEqual(["Rahasia cut", "Internal check", "Trailer 30s", "Offline Edit", "Picture Lock"]);
    expect(t.next7.find((e) => e.name === "Trailer 30s")).toMatchObject({ kind: "deliverable", context: "YouTube" });
    expect(t.next7.find((e) => e.name === "Offline Edit")).toMatchObject({ kind: "item", context: "Main Feature", statusLabel: "Belum mulai" });
  });

  it("week lists the Monday-first week's phases, leaves out other weeks and hides internal items from viewers", async () => {
    const t = await admin();
    expect(t.week.start).toBe("2027-01-11"); // TODAY is a Friday
    expect(t.week.days.map((x) => x.date)).toEqual(Array.from({ length: 7 }, (_, n) => addDays("2027-01-11", n)));
    expect(names(t.week.phases)).toEqual(["Offline Edit", "Review hari ini", "Internal check"]);
    expect(t.week.phases[0]).toMatchObject({ track: "Main Feature", parent: false, status: "not_started", ph: 2 });
    expect(names(t.week.phases)).not.toContain("Grading"); // starts after Sunday
    expect(names(t.week.phases)).not.toContain("Ingest & Sync"); // ended before Monday
    const v = await getToday(db, projectId, TODAY, { includeInternal: false });
    expect(names(v.week.phases)).toEqual(["Offline Edit", "Review hari ini"]);
  });

  it("leaves out finished items, derived deliverables and counts delivered ones only", async () => {
    const t = await admin();
    expect(names([...t.late, ...t.next7, ...t.dueToday])).not.toContain("Poster");
    expect(names(t.next7)).not.toContain("Derived thumb");
    expect(t.deliverables).toEqual({ total: 3, done: 1 });
    const grading = (await sch.getSchedule(db, projectId, { includeInternal: true })).tracks[0].items.find((i) => i.name === "Grading")!;
    expect(names(t.next7)).not.toContain(grading.name);
  });

  it("lists the next hard deadline with days left", async () => {
    expect((await admin()).hardDeadlines).toEqual([{ id: id.get("Picture Lock"), name: "Picture Lock", track: "Main Feature", dueDate: addDays(TODAY, 4), daysLeft: 4 }]);
  });

  it("lists links not yet approved, with where they are attached", async () => {
    const t = await admin();
    expect(t.review.map((r) => [r.label, r.where, r.number])).toEqual([["Cut A", "Main Feature / Offline Edit", 1], ["Hidden cut", "Main Feature / Internal check", 1]]);
  });

  it("follow-up needs a due date within 7 days and no update for more than STALE_DAYS", async () => {
    let t = await admin();
    expect(t.followUp.map((f) => [f.name, f.daysSinceUpdate])).toEqual([["Ingest & Sync", 10]]);
    expect(t.followUp[0]).toMatchObject({ picName: "Budi", picEmail: "budi@x.id", picPhone: "0811", late: true });
    await setUpdated("Offline Edit", `${addDays(TODAY, -STALE_DAYS)}T05:00:00Z`); // exactly 3 days: not stale yet
    t = await admin();
    expect(names(t.followUp)).toEqual(["Ingest & Sync"]);
    await setUpdated("Offline Edit", `${addDays(TODAY, -STALE_DAYS - 1)}T05:00:00Z`);
    t = await admin();
    expect(t.followUp.map((f) => [f.name, f.daysSinceUpdate])).toEqual([["Ingest & Sync", 10], ["Offline Edit", 4]]);
    // Not due within a week: never listed, however stale.
    await setUpdated("Grading", `${addDays(TODAY, -30)}T05:00:00Z`);
    expect(names((await admin()).followUp)).not.toContain("Grading");
    await setUpdated("Offline Edit", `${addDays(TODAY, -1)}T05:00:00Z`);
  });

  it("viewer data has no internal items, links, deliverables or contact details", async () => {
    await setUpdated("Offline Edit", `${addDays(TODAY, -5)}T05:00:00Z`);
    const v = await getToday(db, projectId, TODAY, { includeInternal: false });
    const all = [...v.dueToday, ...v.late, ...v.next7];
    expect(names(all)).not.toContain("Internal check");
    expect(names(all)).not.toContain("Rahasia cut");
    expect(v.review.map((r) => r.label)).toEqual(["Cut A"]);
    expect(v.deliverables.total).toBe(2);
    const offline = v.followUp.find((f) => f.name === "Offline Edit")!;
    expect(offline).toMatchObject({ picName: null, picEmail: null, picPhone: null });
    expect(JSON.stringify(v)).not.toMatch(/secret@x\.id|0899|Rahasia/);
    await setUpdated("Offline Edit", `${addDays(TODAY, -1)}T05:00:00Z`);
  });

  afterEach(() => vi.useRealTimers());

  it("markFollowedUp clears the item from follow-up and writes one audit entry", async () => {
    await expect(sch.markFollowedUp(db, outsider, projectId, id.get("Ingest & Sync")!, "x")).rejects.toBeInstanceOf(ForbiddenError);
    vi.useFakeTimers({ toFake: ["Date"], now: new Date(`${TODAY}T05:00:00Z`) }); // updated_at is stamped with the app clock
    await sch.markFollowedUp(db, asst, projectId, id.get("Ingest & Sync")!, "  sudah WA Budi  ");
    expect(names((await admin()).followUp)).not.toContain("Ingest & Sync");
    const [{ entry }] = await s.listActivity(db, projectId);
    expect(entry).toMatchObject({ summary: 'Follow-up "Ingest & Sync"', reason: "sudah WA Budi", entity: "schedule_item" });
    await expect(sch.markFollowedUp(db, sup, projectId, crypto.randomUUID(), "")).rejects.toBeInstanceOf(s.InputError);
  });

  it("weekly report shows slip against baseline and recent changes", async () => {
    await sch.applyShift(db, sup, projectId, id.get("Picture Lock")!, { startDate: addDays(TODAY, 6), dueDate: addDays(TODAY, 6), cascade: false });
    const r = await getWeeklyReport(db, projectId, TODAY);
    const lock = r.tracks[0].phases.find((p) => p.name === "Picture Lock")!;
    expect(lock.slip).toBe(2);
    expect(r.tracks[0].phases.find((p) => p.name === "Ingest & Sync")).toMatchObject({ late: true, slip: 0 });
    expect((await getWeeklyReport(db, projectId, todayWib())).activity.length).toBeGreaterThan(0); // audit rows carry the real clock
  });
});
