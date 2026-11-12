import { sql } from "drizzle-orm";
import { expect, it } from "vitest";
import { createPgliteDb } from "@/db/client";

it("every table in post_system has row level security enabled", async () => {
  const db = await createPgliteDb();
  const res = await db.execute(sql`
    select c.relname as name, c.relrowsecurity as rls
    from pg_class c join pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'post_system' and c.relkind = 'r'`);
  const rows = res.rows as { name: string; rls: boolean }[];
  expect(rows.length).toBeGreaterThanOrEqual(18);
  // A new table without RLS means its migration forgot ENABLE ROW LEVEL SECURITY.
  expect(rows.filter((r) => !r.rls).map((r) => r.name)).toEqual([]);
});
