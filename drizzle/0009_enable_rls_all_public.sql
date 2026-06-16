-- 0009_enable_rls_all_public.sql — Complete the deny-by-default RLS lockdown
--
-- WHY THIS EXISTS
-- ---------------
-- Supabase's database linter flagged 21 tables in the public schema with
-- "RLS Disabled in Public" (ERROR, SECURITY). Migration 0007_enable_rls.sql
-- already covers 17 of them, but the advisory still fires on all 21 — which
-- means 0007 was never applied to the project (the journal is partial and
-- these migrations are applied by hand). 0007 also predates the four
-- event-ingestion tables from 0001 (raw_events, ingested_events,
-- unparseable_locations, venue_geocache), so it would not cover them anyway.
--
-- This migration is STANDALONE: it re-affirms RLS on every flagged table in
-- one file, so applying ONLY 0009 fully clears the advisory regardless of
-- whether 0007 was ever run. It keeps 0007's deny-by-default philosophy —
-- RLS on, ZERO policies — rather than adding speculative public-read policies.
--
-- WHY DENY-ALL IS CORRECT HERE (verified 2026-06-16)
-- --------------------------------------------------
-- The app reads/writes Postgres ONLY through Drizzle over a direct connection
-- string (DATABASE_URL / POSTGRES_URL) on a privileged role that has BYPASSRLS
-- — see src/lib/db/client.ts. The Supabase client (@supabase/ssr) is used
-- ONLY for auth (supabase.auth.getUser / OTP / sessions); a codebase grep
-- confirms ZERO `.from('<table>')` PostgREST table reads anywhere. So the
-- anon/authenticated PostgREST roles are never used for data, and RLS-on +
-- no-policies (which denies those roles) is non-breaking for the app while
-- closing the public read/write hole on user data (user_profiles, follows,
-- push_subscriptions, submissions, place_claims, business_updates, radii).
-- If a real per-user PostgREST feature is ever added, add explicit policies
-- THEN — never pre-emptively.
--
-- HOW TO APPLY: paste into the Supabase SQL editor (Dashboard → SQL) or run
-- via psql against the project. Idempotent — ENABLE ROW LEVEL SECURITY and the
-- REVOKEs are safe to run more than once.

-- 1) Pull back the blanket grants Supabase hands the public roles, and stop
--    future tables from auto-granting to them. (Same belt-and-suspenders 0007
--    does; harmless to repeat.)
REVOKE ALL ON ALL TABLES    IN SCHEMA public FROM anon, authenticated;
REVOKE ALL ON ALL SEQUENCES IN SCHEMA public FROM anon, authenticated;
REVOKE ALL ON ALL FUNCTIONS IN SCHEMA public FROM anon, authenticated;
ALTER DEFAULT PRIVILEGES IN SCHEMA public REVOKE ALL ON TABLES    FROM anon, authenticated;
ALTER DEFAULT PRIVILEGES IN SCHEMA public REVOKE ALL ON SEQUENCES FROM anon, authenticated;
ALTER DEFAULT PRIVILEGES IN SCHEMA public REVOKE ALL ON FUNCTIONS FROM anon, authenticated;

-- 2) Enable RLS on every flagged table (deny-by-default; no policies = no
--    access for anon/authenticated/PostgREST). Re-enabling is a no-op.

-- Reference + content (public data, but still no reason to expose via PostgREST)
ALTER TABLE public.municipalities        ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.categories            ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.tags                  ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.places                ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.events                ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.data_sources          ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.civic_alerts          ENABLE ROW LEVEL SECURITY;

-- Private / user data (the sensitive ones the advisory is really about)
ALTER TABLE public.radii                 ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.push_subscriptions    ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.submissions           ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.user_profiles         ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.follows               ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.place_claims          ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.business_updates      ENABLE ROW LEVEL SECURITY;

-- Internal ops / pipeline plumbing
ALTER TABLE public.ingest_runs           ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.feed_snapshots        ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.push_log              ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.raw_events            ENABLE ROW LEVEL SECURITY;  -- missing from 0007
ALTER TABLE public.ingested_events       ENABLE ROW LEVEL SECURITY;  -- missing from 0007
ALTER TABLE public.unparseable_locations ENABLE ROW LEVEL SECURITY;  -- missing from 0007
ALTER TABLE public.venue_geocache        ENABLE ROW LEVEL SECURITY;  -- missing from 0007
