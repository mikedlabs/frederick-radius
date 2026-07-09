-- 0017_usage_counters.sql — daily call counters for the paid upstreams.
--
-- WHY THIS EXISTS
-- ---------------
-- The owner asked "what would incur the most cost" and there was no way to
-- answer from the app: Google photos, the Ask LLM, and Mapbox calls were
-- unmeasured until the provider invoice arrived. This table is the app's own
-- meter: one row per (Eastern day, upstream), incremented fail-soft beside
-- each paid fetch, read by /admin/costs. Counts are an upper bound on billable
-- calls (platform fetch caching means some metered requests never hit the
-- network), which is the safe direction for a cost dashboard.
--
-- Additive + RLS deny-all like the rest of the schema; writes go through the
-- BYPASSRLS server role only. Idempotent — safe to re-run.
--
-- APPLY BY HAND in the Supabase SQL editor (per drizzle/README.md).

CREATE TABLE IF NOT EXISTS public.usage_counters (
  id       uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  day      date NOT NULL,
  upstream text NOT NULL,
  count    integer NOT NULL DEFAULT 0
);

CREATE UNIQUE INDEX IF NOT EXISTS usage_counters_day_upstream_uq
  ON public.usage_counters (day, upstream);

ALTER TABLE public.usage_counters ENABLE ROW LEVEL SECURITY;
