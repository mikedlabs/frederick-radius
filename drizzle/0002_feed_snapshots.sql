-- feed_snapshots: per-fetch distribution capture for live event feeds.
-- Read pattern is "last two rows for one source", so the only index
-- needed is (source, taken_at desc).
CREATE TABLE IF NOT EXISTS feed_snapshots (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  source            text NOT NULL,
  taken_at          timestamptz NOT NULL,
  count             integer NOT NULL,
  free_ratio        real NOT NULL,
  empty_desc_ratio  real NOT NULL,
  top_venue         jsonb,
  top_category      jsonb,
  earliest          timestamptz,
  latest            timestamptz,
  created_at        timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS feed_snapshots_source_taken_idx
  ON feed_snapshots (source, taken_at DESC);
