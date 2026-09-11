-- 0037_places_postgis.sql
--
-- Add an indexed PostGIS geography to the existing places mirror without
-- changing its lng/lat write contract or exposing a new public Data API.
-- Runtime reads remain behind a rollout flag until this table matches the
-- canonical public place catalog.

BEGIN;

SET LOCAL lock_timeout = '5s';
SET LOCAL statement_timeout = '120s';

CREATE SCHEMA IF NOT EXISTS extensions;
CREATE EXTENSION IF NOT EXISTS postgis WITH SCHEMA extensions;

-- PostGIS cannot be moved safely after dependent objects exist. Refuse to
-- create mixed-schema spatial objects if it was installed elsewhere.
DO $guard$
DECLARE
  installed_schema text;
BEGIN
  SELECT n.nspname
    INTO installed_schema
  FROM pg_extension e
  JOIN pg_namespace n ON n.oid = e.extnamespace
  WHERE e.extname = 'postgis';

  IF installed_schema IS DISTINCT FROM 'extensions' THEN
    RAISE EXCEPTION
      'postgis must be installed in extensions, found %',
      installed_schema;
  END IF;
END
$guard$;

DO $constraint$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conrelid = 'public.places'::regclass
      AND conname = 'places_lng_lat_world_check'
  ) THEN
    ALTER TABLE public.places
      ADD CONSTRAINT places_lng_lat_world_check
      CHECK (
        lng BETWEEN -180.0 AND 180.0
        AND lat BETWEEN -90.0 AND 90.0
      )
      NOT VALID;
  END IF;
END
$constraint$;

ALTER TABLE public.places
  VALIDATE CONSTRAINT places_lng_lat_world_check;

ALTER TABLE public.places
  ADD COLUMN IF NOT EXISTS location extensions.geography(Point, 4326)
  GENERATED ALWAYS AS (
    extensions.st_setsrid(
      extensions.st_makepoint(lng, lat),
      4326
    )::extensions.geography
  ) STORED;

DO $location_contract$
DECLARE
  is_stored_generated boolean;
  data_type text;
  generation_expression text;
BEGIN
  SELECT
    a.attgenerated = 's',
    format_type(a.atttypid, a.atttypmod),
    pg_get_expr(d.adbin, d.adrelid)
  INTO
    is_stored_generated,
    data_type,
    generation_expression
  FROM pg_attribute a
  LEFT JOIN pg_attrdef d
    ON d.adrelid = a.attrelid
   AND d.adnum = a.attnum
  WHERE a.attrelid = 'public.places'::regclass
    AND a.attname = 'location'
    AND NOT a.attisdropped;

  IF NOT FOUND
    OR NOT is_stored_generated
    OR lower(replace(data_type, ' ', '')) NOT LIKE '%geography(point,4326)'
    OR generation_expression IS NULL
    OR generation_expression NOT ILIKE '%st_makepoint%'
    OR generation_expression NOT ILIKE '%lng%'
    OR generation_expression NOT ILIKE '%lat%'
  THEN
    RAISE EXCEPTION
      'public.places.location does not match the expected generated geography contract';
  END IF;
END
$location_contract$;

ALTER TABLE public.places
  ALTER COLUMN location SET NOT NULL;

CREATE INDEX IF NOT EXISTS places_location_gist_idx
  ON public.places USING gist (location);

CREATE TABLE IF NOT EXISTS public.place_spatial_sync_state (
  catalog_key  text        PRIMARY KEY,
  catalog_hash text        NOT NULL,
  place_count  integer     NOT NULL,
  synced_at    timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT place_spatial_sync_state_count_check
    CHECK (place_count >= 0)
);

ALTER TABLE public.place_spatial_sync_state ENABLE ROW LEVEL SECURITY;
REVOKE ALL PRIVILEGES ON TABLE public.place_spatial_sync_state
  FROM anon, authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE
  ON TABLE public.place_spatial_sync_state
  TO service_role;

CREATE OR REPLACE FUNCTION public.invalidate_place_spatial_sync_state()
RETURNS trigger
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = pg_catalog
AS $function$
BEGIN
  DELETE FROM public.place_spatial_sync_state
  WHERE catalog_key = 'public-place-catalog';
  RETURN NULL;
END
$function$;

REVOKE ALL PRIVILEGES
  ON FUNCTION public.invalidate_place_spatial_sync_state()
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE
  ON FUNCTION public.invalidate_place_spatial_sync_state()
  TO service_role;

DROP TRIGGER IF EXISTS places_invalidate_spatial_sync_state
  ON public.places;
CREATE TRIGGER places_invalidate_spatial_sync_state
AFTER INSERT OR UPDATE OR DELETE ON public.places
FOR EACH STATEMENT
EXECUTE FUNCTION public.invalidate_place_spatial_sync_state();

COMMENT ON COLUMN public.places.location IS
  'Generated WGS84 geography point derived from lng/lat; server-only spatial queries use this column.';
COMMENT ON TABLE public.place_spatial_sync_state IS
  'Server-only proof that the PostGIS places mirror exactly matches a deployed public catalog. RLS denies public Data API access.';

ANALYZE public.places;

COMMIT;

-- Verification after apply:
--
-- SELECT e.extversion, n.nspname AS extension_schema
-- FROM pg_extension e
-- JOIN pg_namespace n ON n.oid = e.extnamespace
-- WHERE e.extname = 'postgis';
--
-- SELECT
--   count(*) AS total,
--   count(location) AS populated,
--   count(*) FILTER (
--     WHERE extensions.st_srid(location::extensions.geometry) <> 4326
--   ) AS bad_srid,
--   max(abs(extensions.st_x(location::extensions.geometry) - lng))
--     AS max_lng_delta,
--   max(abs(extensions.st_y(location::extensions.geometry) - lat))
--     AS max_lat_delta
-- FROM public.places;
--
-- SELECT catalog_key, catalog_hash, place_count, synced_at
-- FROM public.place_spatial_sync_state;
--
-- SELECT tgname, tgenabled
-- FROM pg_trigger
-- WHERE tgrelid = 'public.places'::regclass
--   AND tgname = 'places_invalidate_spatial_sync_state'
--   AND NOT tgisinternal;
--
-- EXPLAIN (ANALYZE, BUFFERS)
-- WITH query_origin AS (
--   SELECT extensions.st_setsrid(
--     extensions.st_makepoint(-77.4105, 39.4143),
--     4326
--   )::extensions.geography AS location
-- )
-- SELECT p.slug,
--        round(extensions.st_distance(p.location, q.location)) AS distance_m
-- FROM public.places p
-- CROSS JOIN query_origin q
-- WHERE p.status = 'active'
--   AND p.deleted_at IS NULL
--   AND extensions.st_dwithin(p.location, q.location, 5000)
-- ORDER BY p.location OPERATOR(extensions.<->) q.location, p.slug
-- LIMIT 20;
