import { beforeAll, describe, expect, it } from "vitest";
import { createPgliteDb, type Db } from "@/db/client";
import { ForbiddenError } from "@/lib/auth/permissions";
import { parseEdl, shotInputs } from "@/lib/edl/edl";
import * as sh from "@/lib/edl/service";
import * as s from "@/lib/services";

const EDL = `TITLE: CUT
001  A001C003 V     C        01:00:10:00 01:00:12:00 01:00:00:00 01:00:02:00
* LOC: 01:00:00:12 RED     VFX_010
002  B004C010 V     C        00:00:00:10 00:00:03:10 01:00:02:00 01:00:05:00
003  C001C001 V     C        00:00:00:00 00:00:01:00 01:00:05:00 01:00:06:00
* LOC: 01:00:05:00 RED     VFX_020
`;

describe("shot tracker", () => {
  let db: Db, sup: string, asst: string, projectId: string;
  const { events } = parseEdl(EDL);
  const rows = (handles = 8) => shotInputs(events, { fps: 24, handles });

  beforeAll(async () => {
    db = await createPgliteDb();
    sup = (await s.createUser(db, { name: "Sup", email: "sup@x.id", password: "password1" })).id;
    projectId = (await s.createProject(db, sup, { name: "Film", productionType: "feature_theatrical", platforms: ["Bioskop"], unitCount: null })).id;
    await s.addMember(db, sup, projectId, { email: "asst@x.id", role: "assistant", name: "Asst", password: "password1" });
    asst = (await s.listMembers(db, projectId)).find((m) => m.role === "assistant")!.userId;
  });

  it("saves named shots, skips unnamed ones, and only supervisors may save", async () => {
    await expect(sh.saveShots(db, asst, projectId, rows())).rejects.toBeInstanceOf(ForbiddenError);
    expect(await sh.saveShots(db, sup, projectId, rows())).toEqual({ added: 2, updated: 0, unnamed: 1 });
    const list = await sh.listShots(db, projectId);
    expect(list.map((x) => [x.name, x.reel, x.durationFrames, x.handles, x.status])).toEqual([["VFX_010", "A001C003", 48, 8, "not_started"], ["VFX_020", "C001C001", 24, 8, "not_started"]]);
  });

  it("assistants can track status, vendor and version; invalid status is rejected", async () => {
    const [shot] = await sh.listShots(db, projectId);
    await sh.updateShot(db, asst, projectId, shot.id, { status: "in_progress", vendor: " Studio A ", version: "v002" });
    await expect(sh.updateShot(db, asst, projectId, shot.id, { status: "nope" })).rejects.toBeInstanceOf(s.InputError);
    expect((await sh.listShots(db, projectId))[0]).toMatchObject({ status: "in_progress", vendor: "Studio A", version: "v002" });
  });

  it("re-saving a new cut updates timecodes and keeps the tracking fields", async () => {
    const recut = rows(12).map((r) => (r.name === "VFX_010" ? { ...r, srcOut: "01:00:13:00", durationFrames: 72 } : r));
    expect(await sh.saveShots(db, sup, projectId, recut)).toEqual({ added: 0, updated: 2, unnamed: 1 });
    expect((await sh.listShots(db, projectId))[0]).toMatchObject({ name: "VFX_010", srcOut: "01:00:13:00", durationFrames: 72, handles: 12, status: "in_progress", vendor: "Studio A", version: "v002" });
  });

  it("rejects duplicate names, bad timecode and all-unnamed batches", async () => {
    const [a] = rows();
    await expect(sh.saveShots(db, sup, projectId, [a, a])).rejects.toThrow(/ganda/);
    await expect(sh.saveShots(db, sup, projectId, [{ ...a, srcIn: "1:0:0:0" }])).rejects.toThrow(/Timecode/);
    await expect(sh.saveShots(db, sup, projectId, [{ ...a, name: " " }])).rejects.toThrow(/bernama/);
  });

  it("deletes shots (supervisor only) and writes the change log", async () => {
    const list = await sh.listShots(db, projectId);
    await expect(sh.deleteShots(db, asst, projectId, [list[0].id])).rejects.toBeInstanceOf(ForbiddenError);
    expect(await sh.deleteShots(db, sup, projectId, [list[0].id])).toBe(1);
    expect((await sh.listShots(db, projectId)).map((x) => x.name)).toEqual(["VFX_020"]);
    const log = (await s.listActivity(db, projectId)).filter((l) => l.entry.entity === "shot").map((l) => l.entry.action);
    expect(log).toEqual(expect.arrayContaining(["create", "update", "delete"]));
  });
});
