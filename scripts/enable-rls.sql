-- Enables Row-Level Security on every table in the public schema, with no policies attached.
-- This app never uses Supabase's REST/client API — Prisma connects directly to Postgres using
-- the `postgres` role, which has BYPASSRLS and is completely unaffected by RLS either way. The
-- only thing this changes is that Supabase's auto-generated PostgREST API (the thing the anon/
-- authenticated keys can reach) can no longer read, write, or delete ANY row in ANY table, since
-- no policies are granted to those roles — which is exactly the fix Supabase's "Table publicly
-- accessible" / "Sensitive data publicly accessible" alerts are asking for.
--
-- Safe to re-run — ENABLE ROW LEVEL SECURITY is a no-op on a table that already has it enabled.
DO $$
DECLARE
  t text;
BEGIN
  FOR t IN
    SELECT tablename FROM pg_tables WHERE schemaname = 'public'
  LOOP
    EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY;', t);
  END LOOP;
END $$;
