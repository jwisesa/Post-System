import path from "node:path";
import type { PgliteDatabase } from "drizzle-orm/pglite";
import * as schema from "./schema";

export type Db = PgliteDatabase<typeof schema>;

const MIGRATIONS = path.join(process.cwd(), "drizzle");

/** In-memory (dataDir undefined) or on-disk embedded Postgres, migrated. */
export async function createPgliteDb(dataDir?: string): Promise<Db> {
  const { PGlite } = await import("@electric-sql/pglite");
  const { drizzle } = await import("drizzle-orm/pglite");
  const { migrate } = await import("drizzle-orm/pglite/migrator");
  const db = drizzle(new PGlite(dataDir), { schema });
  await migrate(db, { migrationsFolder: MIGRATIONS });
  return db;
}

async function createPostgresDb(url: string): Promise<Db> {
  const { default: postgres } = await import("postgres");
  const { drizzle } = await import("drizzle-orm/postgres-js");
  const { migrate } = await import("drizzle-orm/postgres-js/migrator");
  // prepare:false is required by transaction-mode poolers (Supabase port 6543).
  // A small pool keeps serverless instances from exhausting the database's connections.
  const client = postgres(url, { prepare: false, max: Number(process.env.DB_POOL_MAX) || 3, connect_timeout: 15 });
  const db = drizzle(client, { schema });
  try {
    await migrate(db, { migrationsFolder: MIGRATIONS });
  } catch (e) {
    await client.end({ timeout: 1 }).catch(() => {});
    throw new Error(`Tidak bisa menyiapkan database dari DATABASE_URL: ${e instanceof Error ? e.message : e}`, { cause: e });
  }
  // Same query-builder surface; only the driver differs.
  return db as unknown as Db;
}

const g = globalThis as { __postSystemDb?: Promise<Db> };

function connect(): Promise<Db> {
  if (process.env.DATABASE_URL) return createPostgresDb(process.env.DATABASE_URL);
  // On Vercel the filesystem is ephemeral: an embedded database would silently lose all data.
  if (process.env.VERCEL) return Promise.reject(new Error("DATABASE_URL belum diisi di Environment Variables Vercel."));
  return createPgliteDb(process.env.PGLITE_DIR ?? path.join(process.cwd(), ".data", "pglite"));
}

/** DATABASE_URL -> real Postgres (production); otherwise embedded PGlite in .data/ (local only). */
export function getDb(): Promise<Db> {
  if (!g.__postSystemDb) {
    const pending = connect();
    g.__postSystemDb = pending;
    // Do not cache a failed connection; the next request should retry.
    pending.catch(() => { if (g.__postSystemDb === pending) g.__postSystemDb = undefined; });
  }
  return g.__postSystemDb;
}
