-- 0039_feed_source_health_rollups.sql
--
-- Keep current feed health on a one-row-per-source projection. The historical
-- feed_snapshots table remains the audit trail, but admin and public health
-- reads no longer need to group or sort its full history.
--
-- Additive and idempotent. Apply by hand after 0038, per drizzle/README.md.

BEGIN;

SET LOCAL lock_timeout = '5s';
SET LOCAL statement_timeout = '120s';

CREATE TABLE IF NOT EXISTS public.feed_source_health (
  source                text        PRIMARY KEY,
  taken_at              timestamptz NOT NULL,
  count                 integer     NOT NULL,
  free_ratio            real        NOT NULL,
  empty_desc_ratio      real        NOT NULL,
  top_venue             jsonb,
  top_category          jsonb,
  earliest              timestamptz,
  latest                timestamptz,
  prior_snapshot        jsonb,
  recent_mean_count     real        NOT NULL,
  recent_observations   smallint    NOT NULL DEFAULT 1,
  updated_at            timestamptz NOT NULL DEFAULT now(),

  CONSTRAINT feed_source_health_count_check
    CHECK (count >= 0),
  CONSTRAINT feed_source_health_free_ratio_check
    CHECK (free_ratio BETWEEN 0 AND 1),
  CONSTRAINT feed_source_health_empty_desc_ratio_check
    CHECK (empty_desc_ratio BETWEEN 0 AND 1),
  CONSTRAINT feed_source_health_observations_check
    CHECK (recent_observations BETWEEN 1 AND 84),
  CONSTRAINT feed_source_health_prior_snapshot_check
    CHECK (prior_snapshot IS NULL OR jsonb_typeof(prior_snapshot) = 'object')
);

CREATE INDEX IF NOT EXISTS feed_source_health_taken_idx
  ON public.feed_source_health (taken_at);

-- Seed the projection from existing history once. The source/timestamp index
-- makes the two lateral lookups bounded; the seven-day average is intentionally
-- limited to recent rows instead of re-aggregating the full table.
WITH source_keys AS (
  SELECT DISTINCT source
  FROM public.feed_snapshots
),
prepared AS (
  SELECT
    source_keys.source,
    latest.taken_at,
    latest.count,
    latest.free_ratio,
    latest.empty_desc_ratio,
    latest.top_venue,
    latest.top_category,
    latest.earliest,
    latest.latest,
    CASE
      WHEN prior.taken_at IS NULL THEN NULL
      ELSE jsonb_build_object(
        'taken_at', prior.taken_at,
        'count', prior.count,
        'free_ratio', prior.free_ratio,
        'empty_desc_ratio', prior.empty_desc_ratio,
        'top_venue', prior.top_venue,
        'top_category', prior.top_category,
        'earliest', prior.earliest,
        'latest', prior.latest
      )
    END AS prior_snapshot,
    coalesce(recent.mean_count, latest.count::real) AS recent_mean_count,
    greatest(1, least(coalesce(recent.observations, 1), 84))::smallint
      AS recent_observations
  FROM source_keys
  JOIN LATERAL (
    SELECT taken_at, count, free_ratio, empty_desc_ratio, top_venue,
           top_category, earliest, latest
    FROM public.feed_snapshots
    WHERE feed_snapshots.source = source_keys.source
    ORDER BY taken_at DESC, id DESC
    LIMIT 1
  ) latest ON true
  LEFT JOIN LATERAL (
    SELECT taken_at, count, free_ratio, empty_desc_ratio, top_venue,
           top_category, earliest, latest
    FROM public.feed_snapshots
    WHERE feed_snapshots.source = source_keys.source
    ORDER BY taken_at DESC, id DESC
    OFFSET 1
    LIMIT 1
  ) prior ON true
  LEFT JOIN LATERAL (
    SELECT avg(count)::real AS mean_count, count(*)::integer AS observations
    FROM public.feed_snapshots
    WHERE feed_snapshots.source = source_keys.source
      AND taken_at >= now() - interval '7 days'
  ) recent ON true
)
INSERT INTO public.feed_source_health (
  source,
  taken_at,
  count,
  free_ratio,
  empty_desc_ratio,
  top_venue,
  top_category,
  earliest,
  latest,
  prior_snapshot,
  recent_mean_count,
  recent_observations,
  updated_at
)
SELECT
  source,
  taken_at,
  count,
  free_ratio,
  empty_desc_ratio,
  top_venue,
  top_category,
  earliest,
  latest,
  prior_snapshot,
  recent_mean_count,
  recent_observations,
  now()
FROM prepared
ON CONFLICT (source) DO NOTHING;

ALTER TABLE public.feed_source_health ENABLE ROW LEVEL SECURITY;
REVOKE ALL PRIVILEGES ON TABLE public.feed_source_health
  FROM anon, authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE
  ON TABLE public.feed_source_health
  TO service_role;

COMMENT ON TABLE public.feed_source_health IS
  'Server-only current feed-health projection. Historical observations remain in feed_snapshots; RLS denies public Data API access.';
COMMENT ON COLUMN public.feed_source_health.recent_mean_count IS
  'Bounded rolling mean used to distinguish an expected empty feed from a feed that unexpectedly went quiet.';

ANALYZE public.feed_source_health;

COMMIT;

-- Verification after apply:
--
-- SELECT count(*) AS sources,
--        max(taken_at) AS newest,
--        min(taken_at) AS oldest
-- FROM public.feed_source_health;
--
-- SELECT source, taken_at, count, recent_mean_count, recent_observations
-- FROM public.feed_source_health
-- ORDER BY source;
--
-- SELECT relrowsecurity
-- FROM pg_class
-- WHERE oid = 'public.feed_source_health'::regclass;
