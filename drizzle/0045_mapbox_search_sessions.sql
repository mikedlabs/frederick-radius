-- 0045_mapbox_search_sessions.sql
--
-- Durable, server-owned lifecycle for temporary Mapbox Search Box sessions.
-- Search Box closes a billing session after retrieve, 180 seconds, or 50
-- suggestions. A daily idempotency marker alone cannot represent those
-- transitions and can undercount if a client reuses one UUID after closure.
--
-- Only SHA-256 digests of the opaque session token and retrieved Mapbox ID are
-- stored. Search text, coordinates, suggestions, and retrieved place data are
-- never persisted. Closed rows remain as tombstones so a used UUID can never
-- silently become a new session later.
--
-- Additive and idempotent. Apply by hand after 0044, per drizzle/README.md.

BEGIN;

SET LOCAL lock_timeout = '5s';
SET LOCAL statement_timeout = '30s';

CREATE TABLE IF NOT EXISTS public.mapbox_search_sessions (
  session_token_hash       text PRIMARY KEY,
  state                    text NOT NULL DEFAULT 'active',
  suggestion_count         integer NOT NULL DEFAULT 0,
  started_at               timestamptz NOT NULL DEFAULT now(),
  expires_at               timestamptz NOT NULL,
  closed_at                timestamptz,
  retrieved_mapbox_id_hash text,
  CONSTRAINT mapbox_search_sessions_token_hash_check
    CHECK (session_token_hash ~ '^[0-9a-f]{64}$'),
  CONSTRAINT mapbox_search_sessions_retrieved_hash_check
    CHECK (
      retrieved_mapbox_id_hash IS NULL
      OR retrieved_mapbox_id_hash ~ '^[0-9a-f]{64}$'
    ),
  CONSTRAINT mapbox_search_sessions_state_check
    CHECK (state IN ('active', 'retrieved', 'expired', 'suggestion_limit')),
  CONSTRAINT mapbox_search_sessions_suggestion_count_check
    CHECK (suggestion_count BETWEEN 0 AND 50),
  CONSTRAINT mapbox_search_sessions_expiry_check
    CHECK (expires_at > started_at),
  CONSTRAINT mapbox_search_sessions_closed_state_check
    CHECK (
      (state = 'active' AND closed_at IS NULL)
      OR (state <> 'active' AND closed_at IS NOT NULL)
    )
);

ALTER TABLE public.mapbox_search_sessions ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.mapbox_search_sessions FROM PUBLIC;
REVOKE ALL ON TABLE public.mapbox_search_sessions FROM anon;
REVOKE ALL ON TABLE public.mapbox_search_sessions FROM authenticated;

COMMIT;

-- Verification after apply:
--
-- SELECT
--   to_regclass('public.mapbox_search_sessions') IS NOT NULL AS table_ready,
--   relrowsecurity AS rls_enabled
-- FROM pg_class
-- WHERE oid = to_regclass('public.mapbox_search_sessions');
