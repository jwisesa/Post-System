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
  const db = drizzle(postgres(url, { prepare: false }), { schema });
  await migrate(db, { migrationsFolder: MIGRATIONS });
  // Same query-builder surface; only the driver differs.
  return db as unknown as Db;
}

const g = globalThis as { __postSystemDb?: Promise<Db> };

/** DATABASE_URL -> real Postgres (production); otherwise embedded PGlite in .data/. */
export function getDb(): Promise<Db> {
  g.__postSystemDb ??= process.env.DATABASE_URL
    ? createPostgresDb(process.env.DATABASE_URL)
    : createPgliteDb(process.env.PGLITE_DIR ?? path.join(process.cwd(), ".data", "pglite"));
  return g.__postSystemDb;
}
