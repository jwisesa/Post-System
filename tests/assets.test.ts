import { beforeAll, describe, expect, it } from "vitest";
import { createPgliteDb, type Db } from "@/db/client";
import * as a from "@/lib/assets/service";
import { ForbiddenError } from "@/lib/auth/permissions";
import * as sch from "@/lib/schedule/service";
import * as s from "@/lib/services";

describe("attachments, versions, comments", () => {
  let db: Db, sup: string, asst: string, outsider: string, projectId: string, offline: string, grading: string;
  const link = (targetId: string, label: string, extra: Partial<a.NewAttachment> = {}): a.NewAttachment =>
    ({ targetType: "schedule_item", targetId, kind: "preview", label, url: "https://drive.google.com/x", notes: "", internal: false, ...extra });
  const get = async (label: string) => (await a.listAttachments(db, projectId, { includeInternal: true })).find((x) => x.label === label)!;

  beforeAll(async () => {
    db = await createPgliteDb();
    sup = (await s.createUser(db, { name: "Sup", email: "sup@x.id", password: "password1" })).id;
    outsider = (await s.createUser(db, { name: "Out", email: "out@x.id", password: "password1" })).id;
    projectId = (await s.createProject(db, sup, { name: "Film", productionType: "feature_theatrical", platforms: [], unitCount: null })).id;
    await s.addMember(db, sup, projectId, { email: "asst@x.id", role: "assistant", name: "Asst", password: "password1" });
    asst = (await s.listMembers(db, projectId)).find((m) => m.role === "assistant")!.userId;
    await sch.addTrack(db, sup, projectId, { name: "", template: "feature", startDate: "2026-12-01" });
    const items = (await sch.getSchedule(db, projectId, { includeInternal: true })).tracks[0].items;
    offline = items.find((i) => i.name === "Offline Edit")!.id;
    grading = items.find((i) => i.name === "Grading")!.id;
  });

  it("assistant adds a link as v1; new versions need a change note and are numbered", async () => {
    await a.addAttachment(db, asst, projectId, link(offline, "Offline Cut", { notes: "first assembly" }));
    await expect(a.addVersion(db, asst, projectId, (await get("Offline Cut")).id, { url: "https://vimeo.com/2", notes: " " })).rejects.toBeInstanceOf(s.InputError);
    expect(await a.addVersion(db, asst, projectId, (await get("Offline Cut")).id, { url: "https://vimeo.com/2", notes: "trim adegan 12, ganti musik temp" })).toBe(2);
    const cut = await get("Offline Cut");
    expect(cut.versions.map((v) => v.number)).toEqual([2, 1]);
    expect(cut.versions[0]).toMatchObject({ url: "https://vimeo.com/2", notes: "trim adegan 12, ganti musik temp", status: "pending", author: "Asst" });
    const [{ entry }] = await s.listActivity(db, projectId);
    expect(entry.summary).toBe('Menambah versi v2 untuk "Offline Cut"');
    expect(entry.reason).toBe("trim adegan 12, ganti musik temp");
  });

  it("rejects bad links, unknown targets, and outsiders", async () => {
    await expect(a.addAttachment(db, sup, projectId, link(offline, "X", { url: "javascript:alert(1)" }))).rejects.toBeInstanceOf(s.InputError);
    await expect(a.addAttachment(db, sup, projectId, link(offline, "X", { url: "drive.google.com/x" }))).rejects.toBeInstanceOf(s.InputError);
    await expect(a.addAttachment(db, sup, projectId, link(crypto.randomUUID(), "X"))).rejects.toBeInstanceOf(s.InputError);
    await expect(a.addAttachment(db, sup, projectId, link(offline, "X", { targetType: "project" }))).rejects.toBeInstanceOf(s.InputError);
    await expect(a.addAttachment(db, outsider, projectId, link(offline, "X"))).rejects.toBeInstanceOf(ForbiddenError);
  });

  it("only the supervisor sets approval status", async () => {
    const v2 = (await get("Offline Cut")).versions[0];
    await expect(a.setVersionStatus(db, asst, projectId, v2.id, "approved")).rejects.toBeInstanceOf(ForbiddenError);
    await a.setVersionStatus(db, sup, projectId, v2.id, "changes_requested");
    expect((await get("Offline Cut")).versions[0].status).toBe("changes_requested");
    await expect(a.setVersionStatus(db, sup, projectId, v2.id, "bogus")).rejects.toBeInstanceOf(s.InputError);
  });

  it("comments: members only; authors or supervisors delete", async () => {
    await a.addComment(db, asst, projectId, { targetType: "schedule_item", targetId: offline, body: "Director minta lihat reel 2 dulu" });
    await expect(a.addComment(db, outsider, projectId, { targetType: "schedule_item", targetId: offline, body: "x" })).rejects.toBeInstanceOf(ForbiddenError);
    await a.addComment(db, sup, projectId, { targetType: "schedule_item", targetId: offline, body: "Oke, kirim Jumat" });
    const [first, second] = await a.listComments(db, projectId);
    expect(first).toMatchObject({ author: "Asst", body: "Director minta lihat reel 2 dulu" });
    await expect(a.deleteComment(db, asst, projectId, second.id)).rejects.toBeInstanceOf(s.InputError);
    await a.deleteComment(db, sup, projectId, first.id);
    expect(await a.listComments(db, projectId)).toHaveLength(1);
  });

  it("viewers get public links on visible items, project documents, and no comments", async () => {
    await a.addAttachment(db, sup, projectId, link(offline, "Catatan vendor", { internal: true }));
    await a.addAttachment(db, sup, projectId, link(grading, "Grade Preview"));
    await a.addAttachment(db, sup, projectId, { targetType: "project", targetId: projectId, kind: "document", label: "Script", url: "https://docs.google.com/s", notes: "", internal: false });
    const grade = (await sch.getSchedule(db, projectId, { includeInternal: true })).tracks[0].items.find((i) => i.id === grading)!;
    await sch.updateItemDetails(db, sup, projectId, grading, { name: grade.name, picContactId: null, hardDeadline: false, internal: true });
    const token = (await s.createShareLink(db, sup, projectId, "Director")).token;
    const view = (await s.getViewerData(db, token))!;
    expect(view.attachments.map((x) => x.label).sort()).toEqual(["Offline Cut", "Script"]);
    expect(view).not.toHaveProperty("comments");
  });

  it("deleting an item removes its links and comments", async () => {
    await sch.deleteItem(db, sup, projectId, offline);
    expect((await a.listAttachments(db, projectId, { includeInternal: true })).map((x) => x.label).sort()).toEqual(["Grade Preview", "Script"]);
    expect(await a.listComments(db, projectId)).toHaveLength(0);
  });
});
