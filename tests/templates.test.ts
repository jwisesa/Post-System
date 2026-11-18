import { beforeAll, describe, expect, it } from "vitest";
import { createPgliteDb, type Db } from "@/db/client";
import { ForbiddenError } from "@/lib/auth/permissions";
import { defFromSchedule, fromBuiltin, parseTemplateDef, planBackward, type TemplateDef, type TplPhase } from "@/lib/schedule/backward";
import { InputError } from "@/lib/services";
import * as sch from "@/lib/schedule/service";
import * as tpl from "@/lib/schedule/template-service";
import { TRACK_TEMPLATES } from "@/lib/schedule/templates";
import { calOf, endAfter, isOff, startBefore } from "@/lib/schedule/workdays";
import * as s from "@/lib/services";

const cal = calOf({ skipWeekends: true, national: false });
const OLD = "2020-01-01"; // "today" far in the past: nothing is late
const ph = (key: string, extra: Partial<TplPhase> = {}): TplPhase => ({ key, name: key, days: 1, color: null, after: [], milestones: [], ...extra });
const def = (...phases: TplPhase[]): TemplateDef => ({ v: 1, tracks: [{ name: "T", phases }] });
const by = (p: ReturnType<typeof planBackward>, k: string) => p.phases.find((x) => x.key === k)!;

describe("backward planning", () => {
  it("startBefore inverts endAfter across a weekend and a holiday", () => {
    const c = calOf({ skipWeekends: true, national: false, holidays: [{ date: "2026-12-02", name: "Libur" }] });
    for (const start of ["2026-11-30", "2026-12-03", "2026-12-04"]) {
      for (let n = 1; n <= 9; n++) expect(startBefore(c, endAfter(c, start, n), n)).toBe(start);
    }
  });

  it("a chain ends on the release date; a Sunday release snaps back to Friday", () => {
    const p = planBackward(def(ph("A", { days: 3 }), ph("B", { days: 2, after: ["A"] })), "2026-12-20", cal, OLD);
    expect(p.release).toBe("2026-12-18");
    expect(by(p, "B")).toMatchObject({ start: "2026-12-17", due: "2026-12-18" });
    expect(by(p, "A")).toMatchObject({ start: "2026-12-14", due: "2026-12-16" });
    expect(p.fits).toBe(true);
  });

  it("two parallel branches both end the working day before their join", () => {
    const p = planBackward(def(ph("A", { days: 2 }), ph("B", { days: 4 }), ph("C", { days: 2, after: ["A", "B"] })), "2026-12-18", cal, OLD);
    expect(by(p, "A").due).toBe("2026-12-16");
    expect(by(p, "B").due).toBe("2026-12-16");
  });

  it("endBefore ends a tail phase earlier than the release", () => {
    const p = planBackward(def(ph("A", { days: 1, endBefore: 2 })), "2026-12-18", cal, OLD);
    expect(by(p, "A").due).toBe("2026-12-16");
  });

  it("counts the shortfall per phase in working days", () => {
    const p = planBackward(def(ph("A", { days: 5 }), ph("B", { days: 2, after: ["A"] })), "2026-12-18", cal, "2026-12-15");
    expect(by(p, "A")).toMatchObject({ start: "2026-12-10", shortfall: 3 });
    expect(by(p, "B").shortfall).toBe(0);
    expect(p.fits).toBe(false);
  });

  it("compression fits, leaves hard phases and shortfall-free branches alone", () => {
    const d = def(ph("A", { days: 10 }), ph("B", { days: 2, after: ["A"] }), ph("C", { days: 2, after: ["B"], hard: true }), ph("D", { days: 3 }));
    const p = planBackward(d, "2026-12-18", cal, "2026-12-07");
    expect(p.fits).toBe(false);
    const sug = p.suggestion!;
    expect(sug.fits).toBe(true);
    expect(sug.factor).toBe(0.6);
    expect(sug.phases.find((x) => x.key === "A")!.days).toBe(6);
    expect(sug.phases.find((x) => x.key === "C")!.days).toBe(2);
    expect(sug.phases.find((x) => x.key === "D")).toEqual(by(p, "D"));
    expect(sug.phases.every((x) => x.shortfall === 0)).toBe(true);
  });

  it("an impossible plan returns the earliest release", () => {
    const p = planBackward(def(ph("A", { days: 5, hard: true })), "2026-12-18", cal, "2026-12-17");
    expect(p.suggestion).toMatchObject({ fits: false, minRelease: "2026-12-23" });
  });

  it("hours use the project's hours per day", () => {
    const c = calOf({ skipWeekends: true, national: false, hoursPerDay: 10 });
    expect(by(planBackward(def(ph("A", { days: undefined, hours: 25 })), "2026-12-18", c, OLD), "A").days).toBe(3);
  });

  it("no start, due or milestone lands on a holiday", () => {
    const c = calOf({ skipWeekends: true, national: false, holidays: [{ date: "2026-12-16", name: "x" }, { date: "2026-12-11", name: "y" }] });
    const d = def(ph("A", { days: 4, milestones: [{ name: "m", at: 0.5 }, { name: "e", at: 1 }] }), ph("B", { days: 3, after: ["A"] }));
    const p = planBackward(d, "2026-12-18", c, OLD);
    for (const x of p.phases) for (const date of [x.start, x.due, ...x.milestones.map((m) => m.date)]) expect(isOff(c, date)).toBe(false);
  });

  it("the built-in feature template is valid and Delivery ends on the release date", () => {
    const f = fromBuiltin(TRACK_TEMPLATES.find((t) => t.value === "feature")!, cal);
    expect(parseTemplateDef(f)).toEqual(f);
    expect(by(planBackward(f, "2027-03-26", cal, OLD), "Delivery").due).toBe("2027-03-26");
  });

  it("defFromSchedule round-trips a tight chain", () => {
    const it = (id: string, name: string, startDate: string, dueDate: string, parentId: string | null = null) => ({ id, trackId: "t", parentId, name, startDate, dueDate, color: null, workHours: null, hardDeadline: false, internal: false });
    const items = [it("a", "A", "2026-12-01", "2026-12-04"), it("b", "B", "2026-12-07", "2026-12-10"), it("m", "Review", "2026-12-09", "2026-12-09", "b")];
    const d = defFromSchedule([{ id: "t", name: "T" }], items, [{ itemId: "b", dependsOnId: "a" }], () => undefined, cal);
    const p = planBackward(parseTemplateDef(d), "2026-12-10", cal, OLD);
    expect(by(p, "A")).toMatchObject({ start: "2026-12-01", due: "2026-12-04" });
    expect(by(p, "B")).toMatchObject({ start: "2026-12-07", due: "2026-12-10" });
    expect(by(p, "B").milestones[0].date).toBe("2026-12-09");
  });

  it("parseTemplateDef rejects cycles and unknown after keys", () => {
    expect(() => parseTemplateDef(def(ph("A", { after: ["B"] }), ph("B", { after: ["A"] })))).toThrow(InputError);
    expect(() => parseTemplateDef(def(ph("A", { after: ["Z"] })))).toThrow(InputError);
    expect(() => parseTemplateDef(def(ph("A"), ph("A")))).toThrow(InputError);
  });
});

describe("template service", () => {
  let db: Db, sup: string, asst: string, other: string, projectId: string, project2: string, saved: string;
  const FUTURE = "2030-06-28";
  beforeAll(async () => {
    db = await createPgliteDb();
    sup = (await s.createUser(db, { name: "Sup", email: "sup@t.id", password: "password1" })).id;
    other = (await s.createUser(db, { name: "Other", email: "o@t.id", password: "password1" })).id;
    const mk = (u: string, name: string) => s.createProject(db, u, { name, productionType: "feature_theatrical", platforms: [], unitCount: null }).then((p) => p.id);
    projectId = await mk(sup, "Film");
    project2 = await mk(sup, "Film 2");
    await s.addMember(db, sup, projectId, { email: "a@t.id", role: "assistant", name: "Asst", password: "password1" });
    asst = (await s.listMembers(db, projectId)).find((m) => m.role === "assistant")!.userId;
    await s.addTeamGroup(db, sup, projectId, "Color");
    await sch.addTrack(db, sup, projectId, { name: "Promo", template: "promo", startDate: "2026-12-01" });
    const schedule = await sch.getSchedule(db, projectId, { includeInternal: true });
    const edit = schedule.tracks[0].items.find((i) => i.name === "Edit")!;
    const group = (await s.getTeam(db, projectId, { includeInternal: true })).find((g) => g.name === "Color")!;
    await sch.updateItemDetails(db, sup, projectId, edit.id, { name: "Edit", picContactId: null, picGroupId: group.id, hardDeadline: false, internal: false });
    saved = await tpl.saveTemplateFromProject(db, sup, projectId, { name: "Promo saya", trackIds: [schedule.tracks[0].id] });
  });

  it("an assistant cannot apply, preview or save", async () => {
    await expect(tpl.applyTemplate(db, asst, projectId, { source: { kind: "builtin", value: "promo" }, releaseDate: FUTURE, compress: false, createGroups: false })).rejects.toBeInstanceOf(ForbiddenError);
    await expect(tpl.previewTemplate(db, asst, projectId, { source: { kind: "builtin", value: "promo" }, releaseDate: FUTURE })).rejects.toBeInstanceOf(ForbiddenError);
  });

  it("stores structure only", async () => {
    const [t] = await tpl.listTemplates(db, sup);
    expect(t).toMatchObject({ id: saved, phases: 6 });
    const json = JSON.stringify((await db.query.scheduleTemplates.findFirst())!.data);
    expect(json).not.toMatch(/\d{4}-\d{2}-\d{2}/);
    expect(json).toContain("Color");
  });

  it("apply adds tracks after a version, leaves old items alone and matches groups", async () => {
    const before = await sch.getSchedule(db, projectId, { includeInternal: true });
    const source = { kind: "saved", id: saved } as const;
    const pv = await tpl.previewTemplate(db, sup, projectId, { source, releaseDate: FUTURE });
    expect(pv.existingItems).toBe(before.tracks.flatMap((t) => t.items).length);
    expect(pv.groups).toEqual([{ name: "Color", found: true }]);
    await tpl.applyTemplate(db, sup, projectId, { source, releaseDate: FUTURE, compress: false, createGroups: false });
    const after = await sch.getSchedule(db, projectId, { includeInternal: true });
    expect(after.tracks).toHaveLength(2);
    const old = after.tracks.find((t) => t.id === before.tracks[0].id)!;
    const fresh = after.tracks.find((t) => t.id !== before.tracks[0].id)!;
    const dates = (items: typeof old.items) => items.map((i) => `${i.id} ${i.startDate} ${i.dueDate}`).sort();
    expect(dates(old.items)).toEqual(dates(before.tracks[0].items));
    const edit = fresh.items.find((i) => i.name === "Edit")!;
    expect(edit.picGroupName).toBe("Color");
    expect(fresh.items.find((i) => i.name === "Delivery")!.dueDate).toBe(FUTURE);
    expect((await sch.listVersions(db, projectId)).some((v) => v.name === 'Sebelum template "Promo saya"')).toBe(true);
  });

  it("createGroups decides whether a missing group is created", async () => {
    const source = { kind: "saved", id: saved } as const;
    await tpl.applyTemplate(db, sup, project2, { source, releaseDate: FUTURE, compress: false, createGroups: false });
    const names = async () => (await s.getTeam(db, project2, { includeInternal: true })).map((g) => g.name);
    expect(await names()).not.toContain("Color");
    await tpl.applyTemplate(db, sup, project2, { source, releaseDate: FUTURE, compress: false, createGroups: true });
    expect(await names()).toContain("Color");
    const items = (await sch.getSchedule(db, project2, { includeInternal: true })).tracks.flatMap((t) => t.items);
    expect(items.filter((i) => i.picGroupName === "Color")).toHaveLength(1);
  });

  it("another user cannot list, apply, rename or delete the template", async () => {
    const mine = await s.createProject(db, other, { name: "B", productionType: "feature_theatrical", platforms: [], unitCount: null });
    expect(await tpl.listTemplates(db, other)).toEqual([]);
    await expect(tpl.applyTemplate(db, other, mine.id, { source: { kind: "saved", id: saved }, releaseDate: FUTURE, compress: false, createGroups: false })).rejects.toThrow("Template tidak ditemukan.");
    await expect(tpl.renameTemplate(db, other, saved, "x")).rejects.toThrow("Template tidak ditemukan.");
    await expect(tpl.deleteTemplate(db, other, saved)).rejects.toThrow("Template tidak ditemukan.");
    expect(await tpl.listTemplates(db, sup)).toHaveLength(1);
  });
});
