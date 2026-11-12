import path from "node:path";
import type { PgliteDatabase } from "drizzle-orm/pglite";
import * as schema from "./schema";

export type Db = PgliteDatabase<typeof schema>;

const MIGRATIONS = path.join(process.cwd(), "drizzle");
// The migration journal lives in the app's schema too, not in a shared "drizzle" schema.
const MIGRATE = { migrationsFolder: MIGRATIONS, migrationsSchema: "post_system" };

/** In-memory (dataDir undefined) or on-disk embedded Postgres, migrated. */
export async function createPgliteDb(dataDir?: string): Promise<Db> {
  const { PGlite } = await import("@electric-sql/pglite");
  const { drizzle } = await import("drizzle-orm/pglite");
  const { migrate } = await import("drizzle-orm/pglite/migrator");
  const db = drizzle(new PGlite(dataDir), { schema });
  await migrate(db, MIGRATE);
  return db;
}

async function createPostgresDb(url: string): Promise<Db> {
  const { default: postgres } = await import("postgres");
  const { drizzle } = await import("drizzle-orm/postgres-js");
  const { migrate } = await import("drizzle-orm/postgres-js/migrator");
  // Settings for transaction-mode poolers (Supabase Supavisor, port 6543):
  // - prepare:false: no named prepared statements across pooled backends.
  // - max_pipeline:1: never send a second query on a connection before the first has
  //   answered. Pipelined queries hung in production (backends stuck in ClientRead) as soon
  //   as a page ran several queries at once.
  // - small pool + idle_timeout: serverless instances must not hoard connections.
  const client = postgres(url, {
    prepare: false,
    max_pipeline: 1,
    max: Number(process.env.DB_POOL_MAX) || 5,
    idle_timeout: 20,
    connect_timeout: 15,
  });
  const db = drizzle(client, { schema });
  try {
    await migrate(db, MIGRATE);
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
