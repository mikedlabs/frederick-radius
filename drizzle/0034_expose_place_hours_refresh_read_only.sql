-- The nightly GitHub data steward needs to materialize the Vercel writer's
-- rolling hours rows into the committed public snapshot. These five fields
-- are already public business information. Expose only those columns through
-- Supabase's anon Data API role so GitHub never needs DATABASE_URL or another
-- privileged database credential.
--
-- This is intentionally read-only:
--   * RLS remains enabled.
--   * anon receives SELECT on the named columns only.
--   * authenticated receives no access.
--   * INSERT, UPDATE, DELETE, TRUNCATE, REFERENCES, and TRIGGER stay revoked.
--
-- The explicit column grant is future-safe: adding a private column to the
-- table later will not expose it automatically.

ALTER TABLE public.place_hours_refresh ENABLE ROW LEVEL SECURITY;

REVOKE ALL PRIVILEGES ON TABLE public.place_hours_refresh
  FROM anon, authenticated;

GRANT SELECT (
  slug,
  place_id,
  weekday_hours,
  business_status,
  refreshed_at
) ON TABLE public.place_hours_refresh TO anon;

DROP POLICY IF EXISTS "anon can read public place hours"
  ON public.place_hours_refresh;

CREATE POLICY "anon can read public place hours"
  ON public.place_hours_refresh
  FOR SELECT
  TO anon
  USING (true);

COMMENT ON TABLE public.place_hours_refresh IS
  'Rolling Google hours snapshot. The Vercel cron writes with the server database role; anon may read only the five public snapshot columns for the GitHub materialization job.';
