-- 0008_move_pg_trgm_out_of_public.sql — Move pg_trgm out of the public schema
--
-- WHY THIS EXISTS
-- ---------------
-- Supabase's database linter flags "Extension pg_trgm is installed in the
-- public schema." Extensions in public widen the anon/PostgREST-visible
-- surface and can collide with app objects. The fix is to relocate the
-- extension to the dedicated `extensions` schema Supabase pre-provides (it is
-- already on the API roles' search_path), so unqualified similarity()/`%` and
-- the gin_trgm_ops opclass keep resolving.
--
-- ALTER EXTENSION ... SET SCHEMA moves the extension's functions + operator
-- classes atomically AND rewrites the dependency of any existing GIN trigram
-- index (e.g. places_name_trgm_idx), so indexes are preserved — no reindex.
--
-- Idempotent: the move only runs while the extension still lives in public,
-- so this is safe to re-run and safe on a DB that has already been migrated.
--
-- APPLY MANUALLY (same as the other migrations in this folder): run in the
-- Supabase SQL editor or via psql against the project. The app's own Drizzle
-- connection uses a BYPASSRLS role and is unaffected.

create schema if not exists extensions;
grant usage on schema extensions to public;

do $$
begin
  if exists (
    select 1
    from pg_extension e
    join pg_namespace n on n.oid = e.extnamespace
    where e.extname = 'pg_trgm'
      and n.nspname = 'public'
  ) then
    execute 'alter extension pg_trgm set schema extensions';
  end if;
end
$$;
