import { beforeAll, describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";
import { createPgliteDb, type Db } from "@/db/client";
import { feedbackPoints, reviewerLinks, scheduleItems, signoffs, teamContacts, teamGroups } from "@/db/schema";
import { ForbiddenError } from "@/lib/auth/permissions";
import * as f from "@/lib/feedback/service";
import * as rv from "@/lib/review/service";
import * as sch from "@/lib/schedule/service";
import * as s from "@/lib/services";

describe("reviewer links and sign-offs", () => {
  let db: Db, sup: string, asst: string, projectId: string;
  let m1: string, m2: string, hidden: string, other: string;
  let tok: string, linkId: string, otherTok: string, shareTok: string;

  beforeAll(async () => {
    db = await createPgliteDb();
    sup = (await s.createUser(db, { name: "Sup", email: "sup@x.id", password: "password1" })).id;
    projectId = (await s.createProject(db, sup, { name: "Film", productionType: "feature_theatrical", platforms: [], unitCount: null })).id;
    await s.addMember(db, sup, projectId, { email: "asst@x.id", role: "assistant", name: "Asst", password: "password1" });
    asst = (await s.listMembers(db, projectId)).find((m) => m.role === "assistant")!.userId;
    await sch.addTrack(db, sup, projectId, { name: "", template: "feature", startDate: "2026-12-01" });
    const stones = (await sch.getSchedule(db, projectId, { includeInternal: true })).tracks[0].items.filter((i) => i.parentId);
    [m1, m2, hidden, other] = stones.slice(0, 4).map((i) => i.id);
    // Secrets that must never reach a reviewer page.
    const [g] = await db.select().from(teamGroups).where(eq(teamGroups.projectId, projectId));
    const [c] = await db.insert(teamContacts).values({ projectId, groupId: g.id, name: "Budi PicRahasia", email: "budi@secret.id", phone: "0812-SECRET" }).returning();
    await db.update(scheduleItems).set({ picContactId: c.id, notes: "CATATAN-RAHASIA" }).where(eq(scheduleItems.id, m1));
    await db.update(scheduleItems).set({ internal: true, name: "Item Internal Rahasia" }).where(eq(scheduleItems.id, hidden));
    tok = (await rv.createReviewerLink(db, sup, projectId, { name: "Sutradara Ana", role: "Sutradara", itemIds: [m1, m2, other, "00000000-0000-0000-0000-000000000000"] })).token;
    linkId = (await rv.listReviewerLinks(db, sup, projectId))[0].id;
    otherTok = (await rv.createReviewerLink(db, sup, projectId, { name: "Klien Rudi", role: "Client", itemIds: [other] })).token;
    shareTok = (await s.createShareLink(db, sup, projectId, "View")).token;
  });

  it("assignment keeps only real, non-internal milestones; internal rejected even when requested", async () => {
    const l = await rv.createReviewerLink(db, sup, projectId, { name: "Tmp", role: "", itemIds: [hidden, m1] });
    expect(l.itemIds).toEqual([m1]);
    await rv.revokeReviewerLink(db, sup, projectId, l.id);
  });

  it("DTO leaks nothing beyond the person's own items", async () => {
    await rv.submitReviewerFeedback(db, otherTok, other, "TEKS-ORANG-LAIN");
    await rv.submitReviewerFeedback(db, tok, other, "poin rahasia-uji");
    const [pt] = await db.select().from(feedbackPoints).where(eq(feedbackPoints.body, "poin rahasia-uji"));
    await f.checkPoint(db, sup, projectId, pt.id, { status: "dropped", checkedItemId: other, note: "rahasia tim" });
    const data = await rv.getReviewerData(db, tok);
    expect(data!.items.map((i) => i.id).sort()).toEqual([m1, m2, other].sort());
    const json = JSON.stringify(data);
    for (const bad of ["budi@secret.id", "0812-SECRET", "picName", "PicRahasia", "CATATAN-RAHASIA", "Item Internal Rahasia", "Klien Rudi", "TEKS-ORANG-LAIN", "notes", "rahasia tim", "checkNote"]) expect(json).not.toContain(bad);
    expect(data!.reviewer).toEqual({ name: "Sutradara Ana", role: "Sutradara" });
  });

  it("submit sets fromWho and reviewer_link_id, audits with null user, parses timecode", async () => {
    expect(await rv.submitReviewerFeedback(db, tok, m1, "00:01:02 Potong\nGanti musik")).toBe(2);
    const rows = await db.select().from(feedbackPoints).where(eq(feedbackPoints.itemId, m1));
    expect(rows.every((r) => r.fromWho === "Sutradara Ana" && r.reviewerLinkId === linkId && r.createdBy === null)).toBe(true);
    expect(rows.map((r) => r.ref).sort()).toEqual(["", "00:01:02"]);
    const [{ entry }] = await s.listActivity(db, projectId);
    expect(entry.userId).toBeNull();
    expect(entry.summary).toContain("Sutradara Ana (link reviewer) menambah 2 poin di");
    const mine = (await rv.getReviewerData(db, tok))!.items.find((i) => i.id === m1)!;
    expect(mine.myPoints.map((p) => p.body).sort()).toEqual(["Ganti musik", "Potong"]);
  });

  it("rejects unassigned, internal, empty and oversized input", async () => {
    const unassigned = (await sch.getSchedule(db, projectId, { includeInternal: true })).tracks[0].items.find((i) => i.parentId && ![m1, m2, hidden, other].includes(i.id))!.id;
    await expect(rv.submitReviewerFeedback(db, tok, unassigned, "x")).rejects.toBeInstanceOf(s.InputError);
    await expect(rv.signoffViaLink(db, tok, unassigned, "")).rejects.toBeInstanceOf(s.InputError);
    await expect(rv.submitReviewerFeedback(db, tok, hidden, "x")).rejects.toBeInstanceOf(s.InputError);
    // Assigned by direct write, still internal: rejected.
    await db.update(reviewerLinks).set({ itemIds: [m1, hidden] }).where(eq(reviewerLinks.id, linkId));
    await expect(rv.submitReviewerFeedback(db, tok, hidden, "x")).rejects.toBeInstanceOf(s.InputError);
    await expect(rv.signoffViaLink(db, tok, hidden, "")).rejects.toBeInstanceOf(s.InputError);
    await rv.updateReviewerLinkItems(db, sup, projectId, linkId, [m1, m2, other]);
    await expect(rv.submitReviewerFeedback(db, tok, m1, "  \n ")).rejects.toBeInstanceOf(s.InputError);
    await expect(rv.submitReviewerFeedback(db, tok, m1, "a".repeat(10_001))).rejects.toBeInstanceOf(s.InputError);
    await expect(rv.submitReviewerFeedback(db, tok, m1, Array.from({ length: 101 }, (_, n) => `p${n}`).join("\n"))).rejects.toBeInstanceOf(s.InputError);
  });

  it("sign-off via link once; revoke then sign again keeps both in history", async () => {
    await rv.signoffViaLink(db, tok, m2, "OK dari saya");
    await expect(rv.signoffViaLink(db, tok, m2, "")).rejects.toThrow("Sudah disetujui.");
    expect((await rv.getReviewerData(db, tok))!.items.find((i) => i.id === m2)!.mySignoff).not.toBeNull();
    const [first] = await rv.listSignoffs(db, projectId);
    await expect(rv.revokeSignoff(db, sup, projectId, first.id, "  ")).rejects.toBeInstanceOf(s.InputError);
    await rv.revokeSignoff(db, sup, projectId, first.id, "Ada revisi baru");
    expect((await rv.getReviewerData(db, tok))!.items.find((i) => i.id === m2)!.mySignoff).toBeNull();
    await rv.signoffViaLink(db, tok, m2, "");
    const all = (await rv.listSignoffs(db, projectId)).filter((x) => x.itemId === m2);
    expect(all).toHaveLength(2);
    expect(all.filter((x) => x.revokedAt)).toHaveLength(1);
    expect(all.find((x) => x.revokedAt)!.revokeReason).toBe("Ada revisi baru");
  });

  it("two concurrent sign-offs leave exactly one active", async () => {
    const res = await Promise.allSettled([rv.signoffViaLink(db, tok, m1, ""), rv.signoffViaLink(db, tok, m1, "")]);
    expect(res.filter((r) => r.status === "fulfilled")).toHaveLength(1);
    const lost = res.find((r) => r.status === "rejected") as PromiseRejectedResult;
    expect(lost.reason).toBeInstanceOf(s.InputError);
    expect(lost.reason.message).toBe("Sudah disetujui.");
    const active = (await rv.listSignoffs(db, projectId)).filter((x) => x.itemId === m1 && !x.revokedAt);
    expect(active).toHaveLength(1);
  });

  it("recordSignoff / revokeSignoff need schedule.edit; evidence must be http(s)", async () => {
    const input = { signerName: "Klien", signerRole: "Client", note: "via WA", evidenceUrl: "https://x.id/bukti" };
    await expect(rv.recordSignoff(db, asst, projectId, m1, input)).rejects.toBeInstanceOf(ForbiddenError);
    await expect(rv.recordSignoff(db, sup, projectId, m1, { ...input, evidenceUrl: "javascript:alert(1)" })).rejects.toBeInstanceOf(s.InputError);
    await expect(rv.recordSignoff(db, sup, projectId, m1, { ...input, signerName: " " })).rejects.toBeInstanceOf(s.InputError);
    await rv.recordSignoff(db, sup, projectId, m1, input);
    const rec = (await rv.listSignoffs(db, projectId)).find((x) => x.itemId === m1)!;
    expect(rec).toMatchObject({ recordedBy: sup, recordedByName: "Sup", evidenceUrl: "https://x.id/bukti" });
    await expect(rv.revokeSignoff(db, asst, projectId, rec.id, "x")).rejects.toBeInstanceOf(ForbiddenError);
    await expect(rv.createReviewerLink(db, asst, projectId, { name: "X", role: "", itemIds: [] })).rejects.toBeInstanceOf(ForbiddenError);
  });

  it("revoked or unknown tokens return null and cannot act", async () => {
    expect(await rv.getReviewerData(db, "nope")).toBeNull();
    await rv.revokeReviewerLink(db, sup, projectId, linkId);
    expect(await rv.getReviewerData(db, tok)).toBeNull();
    await expect(rv.submitReviewerFeedback(db, tok, m1, "x")).rejects.toBeInstanceOf(s.InputError);
    await expect(rv.signoffViaLink(db, tok, m1, "")).rejects.toBeInstanceOf(s.InputError);
    await expect(rv.submitReviewerFeedback(db, "nope", m1, "x")).rejects.toBeInstanceOf(s.InputError);
  });

  it("token namespaces are separate", async () => {
    expect(await rv.getReviewerData(db, shareTok)).toBeNull();
    expect(await s.getViewerData(db, otherTok)).toBeNull();
  });

  it("deleting the item removes its sign-offs", async () => {
    expect((await db.select().from(signoffs).where(eq(signoffs.itemId, m2))).length).toBeGreaterThan(0);
    await sch.deleteItem(db, sup, projectId, m2);
    expect(await db.select().from(signoffs).where(eq(signoffs.itemId, m2))).toHaveLength(0);
  });
});
