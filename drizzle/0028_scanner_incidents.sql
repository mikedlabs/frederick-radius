-- 0028_scanner_incidents.sql — archive of PUBLIC scanner incidents.
--
-- WHY THIS EXISTS
-- ---------------
-- The FredScanner #incidents live feed is ephemeral (last hour only). To do
-- anything with the PAST — weekly counts, incident-prone corridors, weather ×
-- crash patterns — each public call has to be banked as it comes through. The
-- scanner-archive cron reads the live feed, runs it through the same public
-- allowlist the map/feed use (so NO medical or personal call is ever written),
-- and appends new rows here.
--
--   scanner_incidents — one row per distinct public call: its kind (Crash,
--     Wires down, Structure fire…), block-level location, whether it plausibly
--     affects a road, and when it was dispatched. Already de-identified: no
--     units, no radio codes, no house numbers, no medical calls. `dedupe_key`
--     (kind|location|occurred_at) stops the same call banking twice across
--     cron cycles.
--
-- RLS DENY-ALL, matching the rest of the schema: every read/write goes through
-- Drizzle/getDb on the BYPASSRLS server role (DATABASE_URL). The trend surfaces
-- read it server-side; the anon key never touches it.
--
-- Additive + idempotent (IF NOT EXISTS / ENABLE RLS no-op / REVOKE repeatable).
-- Safe to run more than once.
--
-- APPLY BY HAND in the Supabase SQL editor (per drizzle/README.md). db:push /
-- db:migrate are BLOCKED in this project.

CREATE TABLE IF NOT EXISTS public.scanner_incidents (
  id           uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  dedupe_key   text        NOT NULL,                    -- kind|location|occurred_at
  kind         text        NOT NULL,                    -- Crash | Wires down | Structure fire | …
  location     text        NOT NULL,                    -- block-level, de-identified
  road_impact  boolean     NOT NULL DEFAULT false,      -- plausibly affects getting around
  occurred_at  timestamptz NOT NULL,                    -- when the call was dispatched
  inserted_at  timestamptz DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS scanner_incidents_dedupe_idx   ON public.scanner_incidents (dedupe_key);
CREATE INDEX        IF NOT EXISTS scanner_incidents_occurred_idx ON public.scanner_incidents (occurred_at);
CREATE INDEX        IF NOT EXISTS scanner_incidents_kind_idx     ON public.scanner_incidents (kind);

-- ── RLS deny-all (server BYPASSRLS role only; no anon/PostgREST access) ─────
ALTER TABLE public.scanner_incidents ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.scanner_incidents FROM anon, authenticated;

COMMENT ON TABLE public.scanner_incidents IS 'Archive of public, de-identified scanner incidents (kind + block-level location + dispatch time), banked by the scanner-archive cron for trend surfaces. No medical/personal calls, no units/radio codes. Server-role only, RLS on with no public policy.';
