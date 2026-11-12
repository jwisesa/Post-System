-- Row Level Security on every table in the app's schema, with no policies.
-- The app connects as the table owner, which bypasses RLS; roles used by a
-- hosted Data API (e.g. Supabase anon/authenticated) get no access at all.
-- New tables need the same statement in their own migration (tests/rls.test.ts checks).
DO $$
DECLARE t record;
BEGIN
  FOR t IN SELECT tablename FROM pg_tables WHERE schemaname = 'post_system' LOOP
    EXECUTE format('ALTER TABLE post_system.%I ENABLE ROW LEVEL SECURITY', t.tablename);
  END LOOP;
END $$;
