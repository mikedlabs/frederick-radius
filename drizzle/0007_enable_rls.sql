-- 0007_enable_rls.sql — Lock the public PostgREST door (deny-by-default RLS)
--
-- WHY THIS EXISTS
-- ---------------
-- The app talks to Postgres ONLY through Drizzle over a direct connection
-- string (DATABASE_URL / POSTGRES_URL), using a privileged role that has
-- BYPASSRLS. That path is unaffected by anything below.
--
-- But Supabase ALSO exposes every table in the `public` schema through its
-- PostgREST API at  https://<project>.supabase.co/rest/v1/<table>  using the
-- anon key — and that anon key is PUBLIC (it ships in the client bundle as
-- NEXT_PUBLIC_SUPABASE_*). Without Row Level Security, anyone with the anon
-- key can read/write our entire dataset and user data directly, bypassing the
-- app: user_profiles (= auth user ids), push_subscriptions (endpoint + the
-- p256dh/auth keys needed to forge pushes), follows, submissions, place
-- emails, claim records, etc.
--
-- WHAT THIS DOES
-- --------------
-- Enables RLS on every table and adds NO policies. RLS-on + zero-policies =
-- deny ALL access for the anon and authenticated roles (and PostgREST). The
-- app keeps working unchanged because its connection bypasses RLS. We also
-- REVOKE the default grants Supabase hands to anon/authenticated on the
-- public schema, as belt-and-suspenders.
--
-- SAFE TO RUN: breaks nothing the app does today. When we later add real
-- per-user features through PostgREST (we don't today), we add explicit
-- policies then — never before.
--
-- HOW TO APPLY: paste into the Supabase SQL editor (Dashboard → SQL), or run
-- via your Drizzle migrate step. Idempotent — safe to run more than once.

-- 1) Pull back the blanket grants Supabase gives the public roles.
REVOKE ALL ON ALL TABLES    IN SCHEMA public FROM anon, authenticated;
REVOKE ALL ON ALL SEQUENCES IN SCHEMA public FROM anon, authenticated;
REVOKE ALL ON ALL FUNCTIONS IN SCHEMA public FROM anon, authenticated;
-- ...and stop future tables from auto-granting to them.
ALTER DEFAULT PRIVILEGES IN SCHEMA public REVOKE ALL ON TABLES    FROM anon, authenticated;
ALTER DEFAULT PRIVILEGES IN SCHEMA public REVOKE ALL ON SEQUENCES FROM anon, authenticated;
ALTER DEFAULT PRIVILEGES IN SCHEMA public REVOKE ALL ON FUNCTIONS FROM anon, authenticated;

-- 2) Enable RLS on every table (deny-by-default; no policies = no access).
ALTER TABLE public.municipalities      ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.categories          ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.tags                ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.places              ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.events              ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.data_sources        ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ingest_runs         ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.civic_alerts        ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.radii               ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.feed_snapshots      ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.push_subscriptions  ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.push_log            ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.submissions         ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.user_profiles       ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.follows             ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.place_claims        ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.business_updates    ENABLE ROW LEVEL SECURITY;
