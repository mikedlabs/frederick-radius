-- 0038_event_identity_archive.sql
--
-- Durable event identity for links, saved events, and source churn.
--
-- Event URLs are human-readable slugs, but a title edit can change a slug and
-- a feed window can remove an otherwise valid shared link. The source UID is
-- the durable identity. These tables separate that identity from routing:
--
--   event_canonical_records  one current canonical route + renderable snapshot
--   event_source_identities  stable (source, source_uid) -> canonical event
--   event_slug_aliases       every old/current route -> canonical event
--   event_tombstones         last usable snapshot after a source removes a row
--
-- saved_events also retains the canonical identity and the last snapshot it
-- saved. A device therefore does not lose its plan just because a provider
-- changed a title, rotated a feed window, or stopped responding.
--
-- SECURITY: this is server-owned infrastructure, not a public PostgREST API.
-- RLS is enabled with no anon/authenticated policies, all privileges are
-- revoked from those roles, and only service_role receives table access.

BEGIN;

SET LOCAL lock_timeout = '5s';
SET LOCAL statement_timeout = '120s';

CREATE TABLE IF NOT EXISTS public.event_canonical_records (
  id               uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  canonical_slug   text        NOT NULL,
  snapshot         jsonb       NOT NULL,
  starts_at        timestamptz NOT NULL,
  ends_at          timestamptz,
  event_status     text        NOT NULL DEFAULT 'scheduled',
  source_url       text,
  first_seen_at    timestamptz NOT NULL DEFAULT now(),
  last_seen_at     timestamptz NOT NULL DEFAULT now(),
  snapshot_at      timestamptz NOT NULL DEFAULT now(),
  created_at       timestamptz NOT NULL DEFAULT now(),
  updated_at       timestamptz NOT NULL DEFAULT now(),

  CONSTRAINT event_canonical_records_slug_check
    CHECK (canonical_slug ~ '^[a-z0-9]+(?:-[a-z0-9]+)*$'),
  CONSTRAINT event_canonical_records_snapshot_object_check
    CHECK (jsonb_typeof(snapshot) = 'object'),
  CONSTRAINT event_canonical_records_status_check
    CHECK (event_status IN ('scheduled', 'cancelled', 'postponed')),
  CONSTRAINT event_canonical_records_window_check
    CHECK (ends_at IS NULL OR ends_at >= starts_at)
);

CREATE UNIQUE INDEX IF NOT EXISTS event_canonical_records_slug_uq
  ON public.event_canonical_records (canonical_slug);
CREATE INDEX IF NOT EXISTS event_canonical_records_upcoming_idx
  ON public.event_canonical_records (starts_at, id)
  WHERE event_status = 'scheduled';
CREATE INDEX IF NOT EXISTS event_canonical_records_last_seen_idx
  ON public.event_canonical_records (last_seen_at DESC);

CREATE TABLE IF NOT EXISTS public.event_source_identities (
  source              text        NOT NULL,
  source_uid          text        NOT NULL,
  canonical_event_id  uuid        NOT NULL
    REFERENCES public.event_canonical_records (id) ON DELETE CASCADE,
  first_seen_at       timestamptz NOT NULL DEFAULT now(),
  last_seen_at        timestamptz NOT NULL DEFAULT now(),

  CONSTRAINT event_source_identities_pk PRIMARY KEY (source, source_uid),
  CONSTRAINT event_source_identities_source_check
    CHECK (length(btrim(source)) BETWEEN 1 AND 120),
  CONSTRAINT event_source_identities_uid_check
    CHECK (length(btrim(source_uid)) BETWEEN 1 AND 1000)
);

CREATE INDEX IF NOT EXISTS event_source_identities_event_idx
  ON public.event_source_identities (canonical_event_id);

CREATE TABLE IF NOT EXISTS public.event_slug_aliases (
  slug                text        PRIMARY KEY,
  canonical_event_id  uuid        NOT NULL
    REFERENCES public.event_canonical_records (id) ON DELETE CASCADE,
  first_seen_at       timestamptz NOT NULL DEFAULT now(),
  last_seen_at        timestamptz NOT NULL DEFAULT now(),

  CONSTRAINT event_slug_aliases_slug_check
    CHECK (slug ~ '^[a-z0-9]+(?:-[a-z0-9]+)*$')
);

CREATE INDEX IF NOT EXISTS event_slug_aliases_event_idx
  ON public.event_slug_aliases (canonical_event_id);

CREATE TABLE IF NOT EXISTS public.event_tombstones (
  canonical_event_id  uuid        PRIMARY KEY
    REFERENCES public.event_canonical_records (id) ON DELETE CASCADE,
  last_snapshot       jsonb       NOT NULL,
  reason              text        NOT NULL DEFAULT 'source_gone',
  tombstoned_at       timestamptz NOT NULL DEFAULT now(),
  source_last_seen_at timestamptz,
  expires_at          timestamptz,

  CONSTRAINT event_tombstones_snapshot_object_check
    CHECK (jsonb_typeof(last_snapshot) = 'object'),
  CONSTRAINT event_tombstones_reason_check
    CHECK (reason IN ('source_gone', 'expired', 'cancelled', 'merged', 'manual')),
  CONSTRAINT event_tombstones_expiry_check
    CHECK (expires_at IS NULL OR expires_at > tombstoned_at)
);

ALTER TABLE public.saved_events
  ADD COLUMN IF NOT EXISTS canonical_event_id uuid
    REFERENCES public.event_canonical_records (id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS canonical_event_slug text,
  ADD COLUMN IF NOT EXISTS event_snapshot jsonb,
  ADD COLUMN IF NOT EXISTS snapshot_at timestamptz;

DO $saved_snapshot_constraint$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conrelid = 'public.saved_events'::regclass
      AND conname = 'saved_events_snapshot_object_check'
  ) THEN
    ALTER TABLE public.saved_events
      ADD CONSTRAINT saved_events_snapshot_object_check
      CHECK (event_snapshot IS NULL OR jsonb_typeof(event_snapshot) = 'object');
  END IF;
END
$saved_snapshot_constraint$;

CREATE INDEX IF NOT EXISTS saved_events_canonical_event_idx
  ON public.saved_events (canonical_event_id)
  WHERE canonical_event_id IS NOT NULL;

ALTER TABLE public.event_canonical_records ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.event_source_identities ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.event_slug_aliases ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.event_tombstones ENABLE ROW LEVEL SECURITY;

REVOKE ALL PRIVILEGES ON TABLE
  public.event_canonical_records,
  public.event_source_identities,
  public.event_slug_aliases,
  public.event_tombstones
FROM anon, authenticated;

GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE
  public.event_canonical_records,
  public.event_source_identities,
  public.event_slug_aliases,
  public.event_tombstones
TO service_role;

COMMENT ON TABLE public.event_canonical_records IS
  'Server-owned canonical event routes and last renderable snapshots.';
COMMENT ON TABLE public.event_source_identities IS
  'Stable publisher source UIDs mapped to canonical event identities.';
COMMENT ON TABLE public.event_slug_aliases IS
  'Current and historical event slugs mapped to one canonical event.';
COMMENT ON TABLE public.event_tombstones IS
  'Last usable event snapshots retained after a source row disappears.';
COMMENT ON COLUMN public.saved_events.event_snapshot IS
  'Last renderable event snapshot captured when this device saved the event.';

COMMIT;

-- Verification after apply:
--
-- SELECT relname, relrowsecurity
-- FROM pg_class
-- WHERE oid IN (
--   'public.event_canonical_records'::regclass,
--   'public.event_source_identities'::regclass,
--   'public.event_slug_aliases'::regclass,
--   'public.event_tombstones'::regclass
-- );
--
-- SELECT grantee, table_name, privilege_type
-- FROM information_schema.role_table_grants
-- WHERE table_schema = 'public'
--   AND table_name LIKE 'event_%'
--   AND grantee IN ('anon', 'authenticated', 'service_role')
-- ORDER BY table_name, grantee, privilege_type;
