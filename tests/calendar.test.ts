import { beforeAll, describe, expect, it } from "vitest";
import { createPgliteDb, type Db } from "@/db/client";
import { buildIcs } from "@/lib/calendar/ics";
import * as cal from "@/lib/calendar/service";
import { ForbiddenError } from "@/lib/auth/permissions";
import * as d from "@/lib/deliverables/service";
import * as sch from "@/lib/schedule/service";
import * as s from "@/lib/services";

const NOW = new Date("2027-01-15T03:04:05Z");
const unfold = (ics: string) => ics.replace(/\r\n /g, "");

describe("buildIcs", () => {
  const one = (over: Partial<Parameters<typeof buildIcs>[1][number]> = {}) =>
    buildIcs("Film", [{ uid: "item-1@post-system", date: "2027-01-31", summary: "Main: Edit", ...over }], NOW);

  it("writes a valid all-day calendar with CRLF endings", () => {
    const ics = one({ description: "Status: Berjalan" });
    expect(ics.startsWith("BEGIN:VCALENDAR\r\nVERSION:2.0\r\nPRODID:")).toBe(true);
    expect(ics.endsWith("END:VEVENT\r\nEND:VCALENDAR\r\n")).toBe(true);
    expect(ics.replace(/\r\n/g, "")).not.toMatch(/[\r\n]/);
    for (const l of ["CALSCALE:GREGORIAN", "X-WR-CALNAME:Film", "UID:item-1@post-system", "DTSTAMP:20270115T030405Z", "DTSTART;VALUE=DATE:20270131", "SUMMARY:Main: Edit", "DESCRIPTION:Status: Berjalan"]) {
      expect(ics.split("\r\n")).toContain(l);
    }
  });

  it("ends the all-day event on the next day, across month and year ends", () => {
    expect(one()).toContain("DTEND;VALUE=DATE:20270201\r\n");
    expect(one({ date: "2026-12-31" })).toContain("DTEND;VALUE=DATE:20270101\r\n");
    expect(one({ date: "2028-02-28" })).toContain("DTEND;VALUE=DATE:20280229\r\n");
  });

  it("escapes backslash, comma, semicolon and newlines", () => {
    const ics = one({ summary: "a,b;c\\d", description: "baris 1\nbaris 2" });
    expect(ics).toContain("SUMMARY:a\\,b\;c\\\\d\r\n");
    expect(ics).toContain("DESCRIPTION:baris 1\\nbaris 2\r\n");
  });

  it("folds long lines at 75 octets without splitting multi-byte characters", () => {
    const summary = `${"x".repeat(60)}⚑ ${"é".repeat(40)} ${"日本語".repeat(10)}`;
    const ics = one({ summary });
    const lines = ics.split("\r\n");
    for (const l of lines) expect(Buffer.byteLength(l, "utf8")).toBeLessThanOrEqual(75);
    const at = lines.findIndex((l) => l.startsWith("SUMMARY:"));
    expect(lines[at + 1].startsWith(" ")).toBe(true);
    expect(Buffer.from(lines[at], "utf8").length).toBeGreaterThan(70);
    expect(unfold(ics)).toContain(`SUMMARY:${summary}\r\n`);
    expect(ics).not.toContain("�");
  });

  it("keeps UIDs stable between builds", () => {
    expect(one()).toBe(one());
    expect(one({ uid: "deliverable-9@post-system" })).toContain("UID:deliverable-9@post-system");
  });
});

describe("calendar feeds", () => {
  let db: Db, sup: string, asst: string, outsider: string, projectId: string, shareToken: string, shareId: string;

  beforeAll(async () => {
    db = await createPgliteDb();
    sup = (await s.createUser(db, { name: "Sup", email: "sup@x.id", password: "password1" })).id;
    outsider = (await s.createUser(db, { name: "Out", email: "out@x.id", password: "password1" })).id;
    projectId = (await s.createProject(db, sup, { name: "Film", productionType: "feature_theatrical", platforms: [], unitCount: null })).id;
    await s.addMember(db, sup, projectId, { email: "asst@x.id", role: "assistant", name: "Asst", password: "password1" });
    asst = (await s.listMembers(db, projectId)).find((m) => m.role === "assistant")!.userId;
    await sch.addTrack(db, sup, projectId, { name: "Trailer", template: "promo", startDate: "2027-01-10" });
    const trackId = (await sch.getSchedule(db, projectId, { includeInternal: true })).tracks[0].id;
    await sch.addItem(db, sup, projectId, { trackId, parentId: null, name: "Rahasia, internal", startDate: "2027-01-12", dueDate: "2027-01-12" });
    const secret = (await sch.getSchedule(db, projectId, { includeInternal: true })).tracks[0].items.find((i) => i.name === "Rahasia, internal")!;
    await sch.updateItemDetails(db, sup, projectId, secret.id, { name: secret.name, picContactId: null, hardDeadline: true, internal: true });
    await d.addDeliverable(db, sup, projectId, { name: "Trailer 30s", platform: "YouTube", groupName: "", trackId: null, spec: {}, origin: "delivered", dueDate: "2027-01-20", notes: "", internal: false });
    await d.addDeliverable(db, sup, projectId, { name: "Derived", platform: "YouTube", groupName: "", trackId: null, spec: {}, origin: "derived", dueDate: "2027-01-21", notes: "", internal: false });
    const link = await s.createShareLink(db, sup, projectId, "Director");
    shareToken = link.token;
    shareId = link.id;
  });

  it("returns the same token until regenerated; regenerating kills the old one", async () => {
    const t1 = await cal.getOrCreateCalendarToken(db, sup, projectId);
    expect(await cal.getOrCreateCalendarToken(db, sup, projectId)).toBe(t1);
    expect(t1).toMatch(/^[A-Za-z0-9_-]{32}$/);
    expect(await cal.getAdminFeed(db, t1)).not.toBeNull();
    const t2 = await cal.regenerateCalendarToken(db, sup, projectId);
    expect(t2).not.toBe(t1);
    expect(await cal.getAdminFeed(db, t1)).toBeNull();
    expect(await cal.getAdminFeed(db, t2)).not.toBeNull();
    expect(await cal.getOrCreateCalendarToken(db, sup, projectId)).toBe(t2);
    const [{ entry }] = await s.listActivity(db, projectId);
    expect(entry.summary).toBe("Membuat ulang link kalender");
  });

  it("tokens are per user; outsiders cannot get one; unknown tokens are null", async () => {
    await expect(cal.getOrCreateCalendarToken(db, outsider, projectId)).rejects.toBeInstanceOf(ForbiddenError);
    expect(await cal.getAdminFeed(db, "nope")).toBeNull();
    const mine = await cal.getOrCreateCalendarToken(db, sup, projectId);
    const theirs = await cal.getOrCreateCalendarToken(db, asst, projectId);
    expect(theirs).not.toBe(mine);
    await s.removeMember(db, sup, projectId, asst);
    expect(await cal.getAdminFeed(db, theirs)).toBeNull();
  });

  it("admin feed has internal items; viewer feed does not", async () => {
    const admin = (await cal.getAdminFeed(db, await cal.getOrCreateCalendarToken(db, sup, projectId)))!;
    const viewer = (await cal.getViewerFeed(db, shareToken))!;
    expect(admin.projectName).toBe("Film");
    const summaries = (f: typeof admin) => f.events.map((e) => e.summary);
    expect(summaries(admin)).toContain("⚑ Trailer: Rahasia, internal");
    expect(summaries(viewer).some((x) => x.includes("Rahasia"))).toBe(false);
    for (const f of [admin, viewer]) {
      expect(summaries(f)).toContain("Deliver: Trailer 30s (YouTube)");
      expect(summaries(f).some((x) => x.includes("Derived"))).toBe(false);
      expect(summaries(f)).toContain("Trailer: Edit");
    }
    expect(viewer.events.length).toBe(admin.events.length - 1);
    const uids = admin.events.map((e) => e.uid);
    expect(new Set(uids).size).toBe(uids.length);
    expect(uids.every((u) => /^(item|deliverable)-[0-9a-f-]{36}@post-system$/.test(u))).toBe(true);
  });

  it("a revoked share link gives no feed", async () => {
    expect(await cal.getViewerFeed(db, "nope")).toBeNull();
    await s.revokeShareLink(db, sup, projectId, shareId);
    expect(await cal.getViewerFeed(db, shareToken)).toBeNull();
  });
});
