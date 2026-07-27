-- Prevent future objects created by Supabase's administrative migration role
-- from inheriting legacy Data API access in the public schema.
--
-- Existing Frederick Radius tables are already fail-closed (RLS enabled,
-- no anon/authenticated grants). These defaults make that posture durable for
-- future tables, sequences, and functions as Supabase changes its platform
-- defaults.
--
-- Production note (2026-07-27): the normal project-admin migration connection
-- cannot alter defaults owned by Supabase's managed `supabase_admin` role
-- ("permission denied to change default privileges"). Keep this file as the
-- exact desired state, but do not mark it applied unless Supabase exposes an
-- elevated dashboard control or support applies it. This does not weaken any
-- existing object; every current public table remains fail-closed.

ALTER DEFAULT PRIVILEGES FOR ROLE supabase_admin IN SCHEMA public
  REVOKE ALL ON TABLES FROM anon, authenticated;

ALTER DEFAULT PRIVILEGES FOR ROLE supabase_admin IN SCHEMA public
  REVOKE ALL ON SEQUENCES FROM anon, authenticated;

ALTER DEFAULT PRIVILEGES FOR ROLE supabase_admin IN SCHEMA public
  REVOKE ALL ON FUNCTIONS FROM anon, authenticated;
