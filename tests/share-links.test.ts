import { beforeAll, describe, expect, it } from "vitest";
import { createPgliteDb, type Db } from "@/db/client";
import { ForbiddenError } from "@/lib/auth/permissions";
import * as b from "@/lib/budget/service";
import * as cal from "@/lib/calendar/service";
import * as d from "@/lib/deliverables/service";
import * as sch from "@/lib/schedule/service";
import * as s from "@/lib/services";
import { DEFAULT_SECTIONS } from "@/lib/share/sections";

describe("per-link sections and hidden items", () => {
  let db: Db, sup: string, asst: string, projectId: string, phaseId: string, stoneId: string, otherPhaseId: string, delivId: string;
  const link = (sections?: string[], hiddenIds?: string[]) => s.createShareLink(db, sup, projectId, "L", { sections, hiddenIds });

  beforeAll(async () => {
    db = await createPgliteDb();
    sup = (await s.createUser(db, { name: "Sup", email: "sup@x.id", password: "password1" })).id;
    projectId = (await s.createProject(db, sup, { name: "Film", productionType: "feature_theatrical", platforms: [], unitCount: null })).id;
    await s.addMember(db, sup, projectId, { email: "asst@x.id", role: "assistant", name: "Asst", password: "password1" });
    asst = (await s.listMembers(db, projectId)).find((m) => m.role === "assistant")!.userId;
    await sch.addTrack(db, sup, projectId, { name: "Trailer", template: "promo", startDate: "2027-01-10" });
    const trackId = (await sch.getSchedule(db, projectId, { includeInternal: true })).tracks[0].id;
    await sch.addItem(db, sup, projectId, { trackId, parentId: null, name: "Fase Rahasia Klien", startDate: "2027-01-12", dueDate: "2027-01-20" });
    await sch.addItem(db, sup, projectId, { trackId, parentId: null, name: "Fase Terbuka", startDate: "2027-01-12", dueDate: "2027-01-20" });
    const items = (await sch.getSchedule(db, projectId, { includeInternal: true })).tracks[0].items;
    phaseId = items.find((i) => i.name === "Fase Rahasia Klien")!.id;
    otherPhaseId = items.find((i) => i.name === "Fase Terbuka")!.id;
    await sch.addItem(db, sup, projectId, { trackId, parentId: phaseId, name: "Milestone Anak", startDate: "2027-01-15", dueDate: "2027-01-15" });
    stoneId = (await sch.getSchedule(db, projectId, { includeInternal: true })).tracks[0].items.find((i) => i.name === "Milestone Anak")!.id;
    await d.addDeliverable(db, sup, projectId, { name: "Trailer 30s", platform: "YouTube", groupName: "", trackId: null, spec: {}, origin: "delivered", dueDate: "2027-01-25", notes: "", internal: false });
    delivId = (await d.listDeliverables(db, projectId, { includeInternal: true }))[0].id;
    const { scopeId } = await b.createScope(db, sup, projectId, { name: "RAHASIA-ANGGARAN-XYZ", budget: 987654321, phaseIds: [] });
    expect(scopeId).toBeTruthy();
  });

  it("default sections equal today's behaviour", async () => {
    const l = await s.createShareLink(db, sup, projectId, "Director");
    expect(l.sections).toEqual(DEFAULT_SECTIONS);
    const v = (await s.getViewerData(db, l.token))!;
    expect(v.schedule).toEqual(await sch.getSchedule(db, projectId, { includeInternal: false }));
    expect(v.deliverables.length).toBe(1);
    expect(v.sections).toEqual(DEFAULT_SECTIONS);
    expect(v.feedback).toEqual([]);
    expect(v.checks).toEqual([]);
  });

  it("a technical-only link has no schedule, deliverables, team or feed events", async () => {
    const l = await link(["technical"]);
    const v = (await s.getViewerData(db, l.token))!;
    expect(v.schedule.tracks.flatMap((t) => t.items)).toEqual([]);
    expect(v.deliverables).toEqual([]);
    expect(v.team).toEqual([]);
    expect(v.today.dueToday.length + v.today.next7.length + v.today.late.length).toBe(0);
    expect(Object.keys(v.techSpec).length).toBeGreaterThan(0);
    expect((await cal.getViewerFeed(db, l.token))!.events).toEqual([]);
  });

  it("hidden ids drop a phase's children, Hari Ini entries and the calendar feed", async () => {
    const l = await link(undefined, [phaseId, delivId]);
    const v = (await s.getViewerData(db, l.token))!;
    const names = v.schedule.tracks.flatMap((t) => t.items.map((i) => i.name));
    expect(names).toContain("Fase Terbuka");
    expect(names).not.toContain("Fase Rahasia Klien");
    expect(names).not.toContain("Milestone Anak");
    expect(v.deliverables).toEqual([]);
    const json = JSON.stringify(v);
    expect(json).not.toContain("Fase Rahasia Klien");
    expect(json).not.toContain("Milestone Anak");
    expect(json).not.toContain("Trailer 30s");
    const feed = JSON.stringify((await cal.getViewerFeed(db, l.token))!.events);
    expect(feed).toContain("Fase Terbuka");
    expect(feed).not.toContain("Rahasia Klien");
    expect(feed).not.toContain("Milestone Anak");
    expect(feed).not.toContain("Trailer 30s");
    expect(otherPhaseId).toBeTruthy();
  });

  it("feedback and checks sections expose only the safe fields on visible items", async () => {
    const { addPoints } = await import("@/lib/feedback/service");
    await addPoints(db, sup, projectId, stoneId, { text: "00:10 Warna terlalu hangat", fromWho: "Klien Rahasia" });
    const hiddenToo = await link(["feedback", "checks"], [phaseId]);
    expect((await s.getViewerData(db, hiddenToo.token))!.feedback).toEqual([]);
    const shown = (await s.getViewerData(db, (await link(["feedback", "checks"])).token))!;
    expect(shown.feedback).toHaveLength(1);
    expect(Object.keys(shown.feedback[0]).sort()).toEqual(["body", "itemId", "itemName", "ref", "status"]);
    expect(JSON.stringify(shown)).not.toContain("Klien Rahasia");
    for (const c of shown.checks) expect(Object.keys(c).sort()).toEqual(["detail", "rule", "severity", "title"]);
  });

  it("budget and script never appear in viewer data, whatever sections are asked for", async () => {
    const all = ["today", "timeline", "deliverables", "assets", "technical", "team", "checks", "feedback", "budget", "script", "bogus"];
    const l = await link(all);
    expect(l.sections).not.toContain("budget");
    expect(l.sections).not.toContain("script");
    expect(l.sections).not.toContain("bogus");
    const v = (await s.getViewerData(db, l.token))!;
    expect(Object.keys(v).filter((k) => /budget|script/i.test(k))).toEqual([]);
    const json = JSON.stringify(v);
    expect(json).not.toContain("RAHASIA-ANGGARAN-XYZ");
    expect(json).not.toContain("987654321");
    await expect(link([])).rejects.toBeInstanceOf(s.InputError);
  });

  it("only a supervisor updates a link; the token stays and the change is logged without secrets", async () => {
    const l = await link();
    await expect(s.updateShareLink(db, asst, projectId, l.id, { label: "X", sections: ["team"] })).rejects.toBeInstanceOf(ForbiddenError);
    await s.updateShareLink(db, sup, projectId, l.id, { label: "Producer", note: "Untuk Budi", sections: ["timeline", "deliverables"], hiddenIds: [phaseId, "00000000-0000-0000-0000-000000000000"] });
    const v = (await s.getViewerData(db, l.token))!;
    expect(v.label).toBe("Producer");
    expect(v.sections).toEqual(["timeline", "deliverables"]);
    const [{ entry }] = await s.listActivity(db, projectId, 1);
    expect(entry.summary).toBe('Mengubah isi link view-only "Producer": Timeline, Deliverables (1 item disembunyikan)');
    await s.revokeShareLink(db, sup, projectId, l.id);
    await expect(s.updateShareLink(db, sup, projectId, l.id, { label: "X" })).rejects.toBeInstanceOf(s.InputError);
  });
});
