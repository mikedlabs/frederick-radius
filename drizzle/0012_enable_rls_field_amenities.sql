-- 0012_enable_rls_field_amenities.sql — Close the RLS gap on the two tables
-- that were added AFTER the deny-all lockdown (0007/0009).
--
-- WHY THIS EXISTS
-- ---------------
-- field_amenities (the /collect field tool, PR #930) and community_reports
-- (PR #937) were modeled in src/lib/db/schema.ts after the deny-all RLS
-- migrations 0007/0009, so those migrations never named them. Their schema.ts
-- comments ASSERT "RLS is enabled," but:
--   - community_reports got it via docs/vision/community-reports.migration.sql
--     (hand-applied), and
--   - field_amenities had NO migration at all — only the code comment.
-- So on prod, field_amenities may be living in `public` WITHOUT RLS, i.e.
-- readable AND writable through the public anon/PostgREST key (the key ships in
-- the client bundle as NEXT_PUBLIC_SUPABASE_*) — exactly the hole 0009 closed
-- for every other table. Collected points carry lat/lng, notes, and a photo
-- URL.
--
-- WHAT THIS DOES
-- -------------
-- Re-affirms the deny-all posture (RLS on, ZERO policies) on both tables and
-- pulls back the default anon/authenticated grants. The app is unaffected:
-- every read/write goes through Drizzle on the BYPASSRLS role (DATABASE_URL);
-- RLS-on + no-policies denies only the anon/authenticated/PostgREST roles,
-- which the app never uses for data (a codebase grep shows zero `.from()`
-- table reads). This also brings the migration changelog in line with the new
-- RLS-coverage guard (src/lib/quality/db-health.ts / mig-6), which would
-- otherwise alert on these two tables.
--
-- IDEMPOTENT + GUARDED: ENABLE ROW LEVEL SECURITY is a no-op when already on
-- (so it's harmless on community_reports, which already has it); the to_regclass
-- guards skip a table that does not yet exist in this environment; the REVOKEs
-- are safe to repeat. Safe to run more than once.
--
-- APPLY BY HAND in the Supabase SQL editor (per drizzle/README.md). The app's
-- own Drizzle connection uses a BYPASSRLS role and is unaffected.

do $$
begin
  if to_regclass('public.field_amenities') is not null then
    execute 'alter table public.field_amenities enable row level security';
    execute 'revoke all on public.field_amenities from anon, authenticated';
  end if;
  if to_regclass('public.community_reports') is not null then
    execute 'alter table public.community_reports enable row level security';
    execute 'revoke all on public.community_reports from anon, authenticated';
  end if;
end
$$;
