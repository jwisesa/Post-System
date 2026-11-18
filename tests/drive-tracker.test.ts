import { readFileSync } from "node:fs";
import { sql } from "drizzle-orm";
import { beforeAll, describe, expect, it, vi } from "vitest";
import { createPgliteDb, type Db } from "@/db/client";
import { formatBytes, getDriveSummary, linkDriveTracker, listDriveTrackerProjects, readOnly } from "@/lib/drive-tracker/service";
import * as s from "@/lib/services";

const DT = "11111111-1111-1111-1111-111111111111";

describe("drive-tracker summary", () => {
  let db: Db, sup: string, projectId: string;

  beforeAll(async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    db = await createPgliteDb();
    sup = (await s.createUser(db, { name: "Sup", email: "sup@x.id", password: "password1" })).id;
    projectId = (await s.createProject(db, sup, { name: "Film", productionType: "feature_theatrical", platforms: [], unitCount: null })).id;
  });

  it("is unlinked without an id", async () => {
    expect(await getDriveSummary(db, null)).toEqual({ state: "unlinked" });
  });

  it("is unavailable, not an error, when the tables are missing", async () => {
    expect((await getDriveSummary(db, DT)).state).toBe("unavailable");
    expect(await listDriveTrackerProjects(db)).toEqual([]);
    await expect(linkDriveTracker(db, sup, projectId, DT)).rejects.toThrow(s.InputError);
  });

  describe("with drive-tracker tables", () => {
    beforeAll(async () => {
      await db.execute(sql`create table public.projects(id uuid primary key, name text, description text, status text)`);
      await db.execute(sql`create table public.drives(id uuid primary key default gen_random_uuid(), drive_code text, label text, project_id uuid, status text, category text, total_size_bytes bigint not null default 0, contents_updated_at timestamptz)`);
      await db.execute(sql`create table public.transactions(drive_id uuid, type text, created_at timestamptz)`);
      await db.execute(sql`insert into public.projects values (${DT}, 'DT Film', '', 'active')`);
      await db.execute(sql`insert into public.drives(project_id, status, category, total_size_bytes, contents_updated_at) values
        (${DT}, 'in_use', 'raw', 1000000000, '2027-01-01T00:00:00Z'),
        (${DT}, 'available', 'backup', 2000000000, '2027-02-01T00:00:00Z'),
        (${DT}, 'available', 'raw', 0, null),
        (${DT}, 'archived', 'backup', 500, null),
        ('22222222-2222-2222-2222-222222222222', 'damaged', 'raw', 9, null)`);
    });

    it("reports unknown linked id as unavailable, not zeros", async () => {
      const r = await getDriveSummary(db, "33333333-3333-3333-3333-333333333333");
      expect(r.state).toBe("unavailable");
    });

    it("counts by status and category and sums bytes", async () => {
      const r = await getDriveSummary(db, DT);
      expect(r).toMatchObject({ state: "ok", project: { name: "DT Film" }, total: 4, backupDrives: 2, rawDrives: 2, totalBytes: 3000000500, outstanding: 1 });
      if (r.state === "ok") {
        expect(r.byStatus).toEqual({ available: 2, in_use: 1, damaged: 0, completed: 0, archived: 1 });
        expect(r.lastUpdate).toBe("2027-02-01T00:00:00.000Z");
      }
    });

    it("links, lists and unlinks with an audit entry", async () => {
      expect(await listDriveTrackerProjects(db)).toEqual([{ id: DT, name: "DT Film" }]);
      await linkDriveTracker(db, sup, projectId, DT);
      expect((await s.listActivity(db, projectId, 1))[0].entry.summary).toContain("Menautkan");
      await linkDriveTracker(db, sup, projectId, null);
      expect((await s.listActivity(db, projectId, 1))[0].entry.summary).toContain("Memutus");
    });

    it("cannot write to public.* through the read-only path", async () => {
      const err = await readOnly(db, (tx) => tx.execute(sql`insert into public.drives(status) values ('available')`)).catch((e) => e);
      expect(String(err.cause?.message ?? err.message)).toMatch(/read-only/i);
    });
  });

  it("service SQL contains no write statements", () => {
    const src = readFileSync("src/lib/drive-tracker/service.ts", "utf8");
    const queries = [...src.matchAll(/sql`([^`]*)`/g)].map((m) => m[1]).filter((q) => !q.startsWith("SET LOCAL"));
    expect(queries.length).toBeGreaterThan(3);
    for (const q of queries) expect(q).not.toMatch(/\b(insert|update|delete|alter|drop|truncate)\b/i);
  });

  it("formats bytes", () => {
    expect(formatBytes(0)).toBe("0 B");
    expect(formatBytes(3000000500)).toBe("3.0 GB");
  });
});
