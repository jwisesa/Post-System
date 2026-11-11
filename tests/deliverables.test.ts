import { beforeAll, describe, expect, it } from "vitest";
import { createPgliteDb, type Db } from "@/db/client";
import * as a from "@/lib/assets/service";
import { ForbiddenError } from "@/lib/auth/permissions";
import * as d from "@/lib/deliverables/service";
import * as sch from "@/lib/schedule/service";
import * as s from "@/lib/services";

describe("deliverables", () => {
  let db: Db, sup: string, asst: string, outsider: string, projectId: string, trailer: string;
  const all = () => d.listDeliverables(db, projectId, { includeInternal: true });
  const find = async (name: string) => (await all()).find((x) => x.name === name)!;
  const manual = (name: string, extra: Partial<d.DeliverableInput> = {}): d.DeliverableInput =>
    ({ name, platform: "Arsip internal", groupName: "Master gambar", trackId: null, spec: {}, origin: "delivered", dueDate: null, notes: "", internal: false, ...extra });

  beforeAll(async () => {
    db = await createPgliteDb();
    sup = (await s.createUser(db, { name: "Sup", email: "sup@x.id", password: "password1" })).id;
    outsider = (await s.createUser(db, { name: "Out", email: "out@x.id", password: "password1" })).id;
    projectId = (await s.createProject(db, sup, { name: "Film", productionType: "feature_theatrical", platforms: ["Bioskop"], unitCount: null })).id;
    await s.addMember(db, sup, projectId, { email: "asst@x.id", role: "assistant", name: "Asst", password: "password1" });
    asst = (await s.listMembers(db, projectId)).find((m) => m.role === "assistant")!.userId;
    await sch.addTrack(db, sup, projectId, { name: "Trailer", template: "promo", startDate: "2026-12-01" });
    trailer = (await sch.getSchedule(db, projectId, { includeInternal: true })).tracks[0].id;
  });

  it("cinema preset builds the checklist and inherits from the Technical Page", async () => {
    const r = await d.applyPreset(db, sup, projectId, { presetId: "cinema", trackId: null, dueDate: "2027-03-01" });
    expect(r).toEqual({ added: 18, skipped: 0 });
    const dpx = await find("DPX sequence (sumber DCP)");
    expect(dpx).toMatchObject({ platform: "Bioskop", groupName: "Master gambar", dueDate: "2027-03-01", status: "not_started", presetId: "cinema" });
    expect(dpx.spec).toMatchObject({ resolution: "4096x1716 (4K Scope)", aspectRatio: "2.39:1", format: "DPX sequence 16-bit" });
    const names = (await all()).map((x) => x.name);
    for (const n of ["Stereo (distribusi biasa)", "DME", "Stems", "File seluruh musik (score & source)", "Music cue list", "ProRes 4K master — textless"]) expect(names).toContain(n);
    expect(names.some((n) => /KDM/.test(n))).toBe(false);
  });

  it("re-applying adds nothing; skip removes items; unknown preset is rejected", async () => {
    expect(await d.applyPreset(db, sup, projectId, { presetId: "cinema", trackId: null, dueDate: null })).toEqual({ added: 0, skipped: 18 });
    const r = await d.applyPreset(db, sup, projectId, { presetId: "promo", trackId: trailer, dueDate: "2026-12-20", skip: [0, 6] });
    expect(r.added).toBe(5);
    expect((await all()).filter((x) => x.trackId === trailer).map((x) => x.name)).not.toContain("DPX sequence (sumber DCP)");
    await expect(d.applyPreset(db, sup, projectId, { presetId: "nope", trackId: null, dueDate: null })).rejects.toBeInstanceOf(s.InputError);
  });

  it("platform-derived items carry no due date and no delivery status", async () => {
    await d.applyPreset(db, sup, projectId, { presetId: "netflix", trackId: null, dueDate: "2027-04-01" });
    const sdr = await find("Stream SDR");
    expect(sdr).toMatchObject({ origin: "derived", dueDate: null, presetVersion: "IMF spec v5.1" });
    await expect(d.setDeliverableStatus(db, sup, projectId, sdr.id, "delivered")).rejects.toBeInstanceOf(s.InputError);
  });

  it("cutdown matrix: one deliverable per duration x ratio", async () => {
    const input = { content: "Trailer", platform: "YouTube", trackId: trailer, durations: ["60s", "30s", "15s"], ratios: ["16:9", "9:16"], dueDate: null };
    expect(await d.generateCutdowns(db, sup, projectId, input)).toEqual({ added: 6, skipped: 0 });
    expect((await find("Trailer 30s 9:16")).spec).toMatchObject({ duration: "30s", aspectRatio: "9:16" });
    expect(await d.generateCutdowns(db, sup, projectId, { ...input, ratios: ["16:9", "9:16", "1:1"] })).toEqual({ added: 3, skipped: 6 });
    await expect(d.generateCutdowns(db, sup, projectId, { ...input, durations: [] })).rejects.toBeInstanceOf(s.InputError);
    const many = Array.from({ length: 11 }, (_, n) => `${n}s`);
    await expect(d.generateCutdowns(db, sup, projectId, { ...input, durations: many, ratios: many })).rejects.toBeInstanceOf(s.InputError);
  });

  it("assistant updates status only; outsiders nothing", async () => {
    const dpx = await find("DPX sequence (sumber DCP)");
    await d.setDeliverableStatus(db, asst, projectId, dpx.id, "qc");
    expect((await find(dpx.name)).status).toBe("qc");
    await expect(d.addDeliverable(db, asst, projectId, manual("X"))).rejects.toBeInstanceOf(ForbiddenError);
    await expect(d.deleteDeliverables(db, asst, projectId, [dpx.id])).rejects.toBeInstanceOf(ForbiddenError);
    await expect(d.applyPreset(db, asst, projectId, { presetId: "prime", trackId: null, dueDate: null })).rejects.toBeInstanceOf(ForbiddenError);
    await expect(d.setDeliverableStatus(db, outsider, projectId, dpx.id, "delivered")).rejects.toBeInstanceOf(ForbiddenError);
    await expect(d.setDeliverableStatus(db, sup, projectId, dpx.id, "bogus")).rejects.toBeInstanceOf(s.InputError);
  });

  it("manual items keep known spec keys only; edits are logged", async () => {
    await d.addDeliverable(db, sup, projectId, manual("Arsip LTO", { spec: { format: "DPX sequence 10-bit", bogus: "x" } }));
    const lto = await find("Arsip LTO");
    expect(lto.spec).toEqual({ format: "DPX sequence 10-bit" });
    await d.updateDeliverable(db, sup, projectId, lto.id, manual("Arsip LTO-9", { dueDate: "2027-05-01", internal: true }));
    expect(await find("Arsip LTO-9")).toMatchObject({ dueDate: "2027-05-01", internal: true });
    expect((await s.listActivity(db, projectId))[0].entry.summary).toBe('Mengubah deliverable "Arsip LTO-9"');
    await expect(d.updateDeliverable(db, sup, projectId, lto.id, manual("X", { dueDate: "besok" }))).rejects.toBeInstanceOf(s.InputError);
  });

  it("links with versions attach to deliverables; viewers never get internal ones", async () => {
    const dpx = await find("DPX sequence (sumber DCP)");
    const lto = await find("Arsip LTO-9");
    const link = (targetId: string, label: string): a.NewAttachment => ({ targetType: "deliverable", targetId, kind: "asset", label, url: "https://drive.google.com/d", notes: "", internal: false });
    await a.addAttachment(db, asst, projectId, link(dpx.id, "Folder DPX"));
    await a.addAttachment(db, sup, projectId, link(lto.id, "Folder LTO"));
    const folder = (await a.listAttachments(db, projectId, { includeInternal: true })).find((x) => x.label === "Folder DPX")!;
    expect(await a.addVersion(db, asst, projectId, folder.id, { url: "https://drive.google.com/d2", notes: "fix reel 3 frame 1021" })).toBe(2);

    const view = (await s.getViewerData(db, (await s.createShareLink(db, sup, projectId, "Producer")).token))!;
    expect(view.deliverables.map((x) => x.name)).toContain("DPX sequence (sumber DCP)");
    expect(view.deliverables.map((x) => x.name)).not.toContain("Arsip LTO-9");
    expect(view.attachments.map((x) => x.label)).toEqual(["Folder DPX"]);
  });

  it("deleting deliverables removes their links", async () => {
    const dpx = await find("DPX sequence (sumber DCP)");
    expect(await d.deleteDeliverables(db, sup, projectId, [dpx.id, crypto.randomUUID()])).toBe(1);
    expect((await a.listAttachments(db, projectId, { includeInternal: true })).map((x) => x.label)).toEqual(["Folder LTO"]);
    const kinds = new Set((await s.listActivity(db, projectId, 500)).map((l) => l.entry.entity));
    expect(kinds.has("deliverable")).toBe(true);
  });
});
