-- 0040_public_event_archive_by_slug.sql
--
-- Event metadata and the page body can render in separate Next.js work. Two
-- direct pooled Postgres reads for the same cold event were able to queue and
-- exhaust the detail-page deadline. Expose one narrow, indexed, read-only RPC
-- through PostgREST so public event pages do not compete for the app's single
-- serverless database connection.
--
-- SECURITY: the four archive tables remain deny-by-default. This function
-- returns only the canonical public slug and the public render snapshot for
-- one exact, validated slug. It exposes no source identity, UUID, tombstone
-- metadata, or operational timestamp.

BEGIN;

SET LOCAL lock_timeout = '5s';
SET LOCAL statement_timeout = '120s';

CREATE OR REPLACE FUNCTION public.public_event_archive_by_slug(
  requested_slug text
)
RETURNS TABLE (
  canonical_slug text,
  snapshot jsonb
)
LANGUAGE sql
STABLE
STRICT
SECURITY DEFINER
SET search_path = ''
ROWS 1
AS $function$
  SELECT
    canonical.canonical_slug,
    coalesce(tombstone.last_snapshot, canonical.snapshot) AS snapshot
  FROM public.event_slug_aliases AS alias
  JOIN public.event_canonical_records AS canonical
    ON canonical.id = alias.canonical_event_id
  LEFT JOIN public.event_tombstones AS tombstone
    ON tombstone.canonical_event_id = canonical.id
  WHERE requested_slug NOT IN ('constructor', 'prototype')
    AND requested_slug
      OPERATOR(pg_catalog.~) '^[a-z0-9][a-z0-9-]{0,199}$'
    AND alias.slug = requested_slug
  LIMIT 1
$function$;

-- Functions are executable by PUBLIC by default. Remove that implicit grant
-- before deliberately opening only this minimal public-event read.
REVOKE ALL PRIVILEGES
  ON FUNCTION public.public_event_archive_by_slug(text)
  FROM PUBLIC, anon, authenticated, service_role;

GRANT EXECUTE
  ON FUNCTION public.public_event_archive_by_slug(text)
  TO anon, authenticated, service_role;

COMMENT ON FUNCTION public.public_event_archive_by_slug(text) IS
  'Returns the minimal public render snapshot for one exact current or historical event slug. Underlying archive tables remain private.';

NOTIFY pgrst, 'reload schema';

COMMIT;

-- Verification after apply:
--
-- SELECT p.prosecdef, p.provolatile, p.proisstrict, p.proconfig
-- FROM pg_proc AS p
-- WHERE p.oid = 'public.public_event_archive_by_slug(text)'::regprocedure;
--
-- SELECT
--   has_function_privilege('anon', 'public.public_event_archive_by_slug(text)', 'EXECUTE') AS anon_execute,
--   has_function_privilege('authenticated', 'public.public_event_archive_by_slug(text)', 'EXECUTE') AS authenticated_execute,
--   has_table_privilege('anon', 'public.event_canonical_records', 'SELECT') AS anon_table_select;

