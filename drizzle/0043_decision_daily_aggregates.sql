-- 0043_decision_daily_aggregates.sql
--
-- Privacy-safe product decision funnel. Each row is one Eastern calendar day
-- and a fixed categorical context with a counter. It MUST NOT contain a
-- visitor/member id, entity slug, path, query, answer, coordinates, IP, or any
-- other free text. The strict CHECK constraints are a second validation layer
-- behind /api/track's fixed server-side parser.
--
-- Additive and idempotent. Apply by hand after 0042, per drizzle/README.md.
-- Do not add this migration to drizzle/applied.json until production apply has
-- been independently confirmed.

BEGIN;

SET LOCAL lock_timeout = '5s';
SET LOCAL statement_timeout = '30s';

CREATE TABLE IF NOT EXISTS public.decision_daily_aggregates (
  day         date        NOT NULL,
  surface     text        NOT NULL,
  stage       text        NOT NULL,
  entity_kind text        NOT NULL,
  position    text        NOT NULL,
  action      text        NOT NULL,
  count       integer     NOT NULL DEFAULT 0,
  updated_at  timestamptz NOT NULL DEFAULT now(),

  CONSTRAINT decision_daily_aggregates_pk PRIMARY KEY
    (day, surface, stage, entity_kind, position, action),
  CONSTRAINT decision_daily_aggregates_count_check
    CHECK (count >= 0),
  CONSTRAINT decision_daily_aggregates_surface_check
    CHECK (surface IN (
      'today', 'ask', 'map', 'events', 'place', 'saved', 'compass', 'search'
    )),
  CONSTRAINT decision_daily_aggregates_stage_check
    CHECK (stage IN ('impression', 'open', 'action', 'feedback')),
  CONSTRAINT decision_daily_aggregates_entity_kind_check
    CHECK (entity_kind IN (
      'place', 'event', 'answer', 'tool', 'amenity', 'route', 'source'
    )),
  CONSTRAINT decision_daily_aggregates_position_check
    CHECK (position IN (
      'lead', 'alternative', 'result', 'detail', 'sheet', 'action_bar'
    )),
  CONSTRAINT decision_daily_aggregates_action_check
    CHECK (action IN (
      'none', 'open', 'directions', 'call', 'email', 'website', 'menu',
      'order', 'parking', 'reservation', 'ticket', 'save', 'share',
      'helpful', 'not_relevant', 'wrong'
    )),
  CONSTRAINT decision_daily_aggregates_stage_action_check
    CHECK (
      (stage = 'impression' AND action = 'none') OR
      (stage = 'open' AND action = 'open') OR
      (stage = 'action' AND action IN (
        'directions', 'call', 'email', 'website', 'menu', 'order', 'parking',
        'reservation', 'ticket', 'save', 'share'
      )) OR
      (stage = 'feedback' AND action IN (
        'helpful', 'not_relevant', 'wrong'
      ))
    )
);

ALTER TABLE public.decision_daily_aggregates ENABLE ROW LEVEL SECURITY;

-- Supabase defaults can grant more than this table needs. Remove everything,
-- including PUBLIC, then restore only the server role's read/upsert surface.
REVOKE ALL PRIVILEGES ON TABLE public.decision_daily_aggregates
  FROM PUBLIC, anon, authenticated, service_role;

GRANT SELECT, INSERT ON TABLE public.decision_daily_aggregates
  TO service_role;
GRANT UPDATE (count, updated_at) ON TABLE public.decision_daily_aggregates
  TO service_role;

COMMENT ON TABLE public.decision_daily_aggregates IS
  'Anonymous daily decision-funnel counts with fixed categorical dimensions only. No visitor, member, entity, route, query, answer, IP, coordinates, or free text. RLS denies public Data API access.';

COMMIT;

-- Verification after apply:
--
-- SELECT
--   c.relrowsecurity AS rls_enabled,
--   c.relforcerowsecurity AS rls_forced
-- FROM pg_class c
-- JOIN pg_namespace n ON n.oid = c.relnamespace
-- WHERE n.nspname = 'public'
--   AND c.relname = 'decision_daily_aggregates';
--
-- SELECT grantee, privilege_type
-- FROM information_schema.role_table_grants
-- WHERE table_schema = 'public'
--   AND table_name = 'decision_daily_aggregates'
--   AND grantee IN ('PUBLIC', 'anon', 'authenticated', 'service_role')
-- ORDER BY grantee, privilege_type;
--
-- SELECT grantee, column_name, privilege_type
-- FROM information_schema.column_privileges
-- WHERE table_schema = 'public'
--   AND table_name = 'decision_daily_aggregates'
--   AND grantee IN ('PUBLIC', 'anon', 'authenticated', 'service_role')
-- ORDER BY grantee, column_name, privilege_type;
--
-- SELECT conname, pg_get_constraintdef(oid) AS definition
-- FROM pg_constraint
-- WHERE conrelid = 'public.decision_daily_aggregates'::regclass
-- ORDER BY conname;
