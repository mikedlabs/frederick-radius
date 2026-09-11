-- Rolling Google-hours refresh snapshot. The paid cron writes through the
-- server's BYPASSRLS database role; no browser/PostgREST consumer needs direct
-- access. Additive and idempotent for the repo's manual Supabase SQL workflow.
--
-- APPLY BY HAND in the Supabase SQL editor before enabling HOURS_REFRESH_CRON.

CREATE TABLE IF NOT EXISTS public.place_hours_refresh (
  slug             text        PRIMARY KEY,
  place_id         text        NOT NULL,
  weekday_hours    jsonb,
  business_status  text,
  refreshed_at     timestamptz NOT NULL
);

CREATE INDEX IF NOT EXISTS place_hours_refresh_refreshed_at_idx
  ON public.place_hours_refresh (refreshed_at);

ALTER TABLE public.place_hours_refresh ENABLE ROW LEVEL SECURITY;

COMMENT ON TABLE public.place_hours_refresh IS
  'Server-only rolling Google hours snapshot. RLS enabled with no public policies; written by the authenticated cron database role.';
