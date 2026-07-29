-- Preserve publisher-provided event artwork for scheduled JSON ingesters.
-- These columns are intentionally on the raw-SQL-only ingested_events table;
-- see drizzle/README.md before applying this migration by hand.

ALTER TABLE public.ingested_events
  ADD COLUMN IF NOT EXISTS hero_image text,
  ADD COLUMN IF NOT EXISTS hero_image_alt text;

COMMENT ON COLUMN public.ingested_events.hero_image IS
  'Publisher-provided event image URL, accepted only by a source-specific adapter policy.';

COMMENT ON COLUMN public.ingested_events.hero_image_alt IS
  'Publisher-provided description of hero_image, when supplied.';
