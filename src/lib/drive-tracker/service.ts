// Read-only window into the owner's other app (drive-tracker, same Supabase database,
// `public` schema). This is the ONLY file allowed to mention `public.*`, and every query
// runs in a READ ONLY transaction, so Postgres itself refuses any write from this path.
import { eq, sql } from "drizzle-orm";
import type { Db } from "@/db/client";
import { projects } from "@/db/schema";
import { InputError, record, requireRole, type Tx } from "../services";

export type DriveStatus = "available" | "in_use" | "damaged" | "completed" | "archived";
export type DriveSummary =
  | { state: "unlinked" }
  | { state: "unavailable"; reason: string }
  | {
      state: "ok";
      project: { name: string; status: string };
      total: number;
      byStatus: Record<DriveStatus, number>;
      backupDrives: number;
      rawDrives: number;
      totalBytes: number;
      outstanding: number; // in_use = "Keluar"
      lastUpdate: string | null;
    };

const rowsOf = <T>(r: unknown): T[] => (Array.isArray(r) ? r : ((r as { rows?: T[] }).rows ?? [])) as T[];

export async function readOnly<T>(db: Db, fn: (tx: Tx) => Promise<T>): Promise<T> {
  return db.transaction(
    async (tx) => {
      await tx.execute(sql`SET LOCAL statement_timeout = '3000'`);
      return fn(tx);
    },
    { accessMode: "read only" },
  );
}

const unavailable = (reason: string): DriveSummary => ({ state: "unavailable", reason });
const hasTables = async (tx: Tx) => {
  const [r] = rowsOf<{ d: string | null; p: string | null }>(await tx.execute(sql`select to_regclass('public.drives') as d, to_regclass('public.projects') as p`));
  return !!(r?.d && r?.p);
};

export async function getDriveSummary(db: Db, linkedId: string | null): Promise<DriveSummary> {
  if (!linkedId) return { state: "unlinked" };
  try {
    return await readOnly(db, async (tx): Promise<DriveSummary> => {
      if (!(await hasTables(tx))) return unavailable("Tabel drive-tracker tidak ada di database ini.");
      const [p] = rowsOf<{ name: string; status: string }>(await tx.execute(sql`select name, status from public.projects where id = ${linkedId}`));
      if (!p) return unavailable("Project drive-tracker tidak terbaca (ID salah atau akses ditolak).");
      const groups = rowsOf<{ status: string; category: string | null; n: number | string; bytes: number | string; last: Date | string | null }>(
        await tx.execute(sql`select status, category, count(*) as n, coalesce(sum(total_size_bytes), 0) as bytes, max(contents_updated_at) as last
          from public.drives where project_id = ${linkedId} group by 1, 2`),
      );
      const byStatus: Record<DriveStatus, number> = { available: 0, in_use: 0, damaged: 0, completed: 0, archived: 0 };
      let total = 0, backupDrives = 0, rawDrives = 0, totalBytes = 0;
      let last: string | null = null;
      for (const g of groups) {
        const n = Number(g.n);
        total += n;
        totalBytes += Number(g.bytes);
        if (g.status in byStatus) byStatus[g.status as DriveStatus] += n;
        if (g.category === "backup") backupDrives += n;
        if (g.category === "raw") rawDrives += n;
        const l = g.last ? new Date(g.last).toISOString() : null;
        if (l && (!last || l > last)) last = l;
      }
      return { state: "ok", project: p, total, byStatus, backupDrives, rawDrives, totalBytes, outstanding: byStatus.in_use, lastUpdate: last };
    });
  } catch (e) {
    console.error("drive-tracker unreachable", e);
    return unavailable("Drive-tracker tidak bisa dibaca saat ini.");
  }
}

/** Allowlist of Post-System account emails (env DRIVE_TRACKER_ADMINS, comma separated). The app connects as the table owner, so drive-tracker's own RLS does not apply: this is the only gate. */
export function canUseDriveTracker(email: string): boolean {
  const list = (process.env.DRIVE_TRACKER_ADMINS ?? "").split(",").map((x) => x.trim().toLowerCase()).filter(Boolean);
  return list.includes(email.trim().toLowerCase());
}

export async function listDriveTrackerProjects(db: Db, email: string): Promise<{ id: string; name: string }[]> {
  if (!canUseDriveTracker(email)) return [];
  try {
    return await readOnly(db, async (tx) => {
      if (!(await hasTables(tx))) return [];
      return rowsOf<{ id: string; name: string }>(await tx.execute(sql`select id, name from public.projects order by name limit 200`));
    });
  } catch (e) {
    console.error("drive-tracker unreachable", e);
    return [];
  }
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export async function linkDriveTracker(db: Db, userId: string, projectId: string, dtProjectId: string | null, email: string) {
  await requireRole(db, userId, projectId, "project.edit");
  if (!canUseDriveTracker(email)) throw new InputError("Tidak punya akses ke drive-tracker.");
  let name = "";
  if (dtProjectId !== null) {
    const id = dtProjectId.trim();
    if (!id) throw new InputError("Pilih project drive-tracker.");
    if (!UUID.test(id)) throw new InputError("Project drive-tracker tidak ditemukan.");
    dtProjectId = id;
    const found = await readOnly(db, async (tx) => {
      if (!(await hasTables(tx))) return undefined;
      return rowsOf<{ name: string }>(await tx.execute(sql`select name from public.projects where id = ${id}`))[0];
    }).catch(() => undefined);
    if (!found) throw new InputError("Project drive-tracker tidak ditemukan.");
    name = found.name;
  }
  await db.transaction(async (tx) => {
    const [before] = await tx.select({ id: projects.driveTrackerProjectId }).from(projects).where(eq(projects.id, projectId));
    await tx.update(projects).set({ driveTrackerProjectId: dtProjectId }).where(eq(projects.id, projectId));
    await record(tx, {
      projectId, userId, entity: "project", entityId: projectId, action: "update",
      summary: dtProjectId ? `Menautkan project drive-tracker "${name}"` : "Memutus tautan project drive-tracker",
      before: { driveTrackerProjectId: before?.id ?? null }, after: { driveTrackerProjectId: dtProjectId },
    });
  });
}

export function formatBytes(n: number): string {
  if (n < 1000) return `${n} B`;
  const u = ["KB", "MB", "GB", "TB", "PB"];
  let i = -1;
  do { n /= 1000; i++; } while (n >= 1000 && i < u.length - 1);
  return `${n.toFixed(n >= 100 ? 0 : 1)} ${u[i]}`;
}
