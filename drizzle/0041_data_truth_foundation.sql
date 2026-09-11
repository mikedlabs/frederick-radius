-- 0041_data_truth_foundation.sql
--
-- Durable evidence for the individual facts Radius publishes, plus versioned
-- snapshots for place catalogs and high-value GIS datasets.
--
-- The four tables deliberately separate different claims:
--
--   dataset_versions        one validated collection/version of a dataset
--   dataset_feature_versions feature history inside those versions
--   field_observations      source-specific evidence for one entity field
--   resolved_field_state    the current server-owned decision for that field
--
-- A fetch is not automatically a publication, a missing value is not the same
-- as a proven absence, and a once-current value cannot remain current forever.
-- Published dataset versions and known resolved fields therefore require a
-- checked_at + valid_until window. Application code must still compare
-- valid_until with the current time when it reads a row.
--
-- SECURITY
-- --------
-- This is internal truth infrastructure, not a public PostgREST API. RLS is
-- enabled without anon/authenticated policies, all public-role privileges are
-- revoked, and only service_role receives explicit CRUD access. Normal app
-- reads continue through the server DATABASE_URL connection.
--
-- RETENTION
-- ---------
-- Evidence and versions retain their historical rows in this first phase.
-- The service role may advance explicit lifecycle columns, but it cannot
-- delete those history rows or rewrite their source identity/value fields.
-- No automatic deletion is introduced until real volume, restore, and audit
-- requirements establish a safe retention window.
--
-- Additive and idempotent. Apply by hand after 0040, per drizzle/README.md.

BEGIN;

SET LOCAL lock_timeout = '5s';
SET LOCAL statement_timeout = '120s';

CREATE TABLE IF NOT EXISTS public.dataset_versions (
  id                 uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  dataset_key        text        NOT NULL,
  source_key         text        NOT NULL,
  version_key        text        NOT NULL,
  content_hash       text        NOT NULL,
  schema_version     text,
  status             text        NOT NULL DEFAULT 'observed',
  record_count       integer     NOT NULL DEFAULT 0,
  added_count        integer     NOT NULL DEFAULT 0,
  changed_count      integer     NOT NULL DEFAULT 0,
  removed_count      integer     NOT NULL DEFAULT 0,
  invalid_count      integer     NOT NULL DEFAULT 0,
  source_updated_at  timestamptz,
  checked_at         timestamptz NOT NULL,
  valid_until        timestamptz,
  validated_at       timestamptz,
  published_at       timestamptz,
  superseded_at      timestamptz,
  provenance         jsonb       NOT NULL DEFAULT '{}'::jsonb,
  metadata           jsonb       NOT NULL DEFAULT '{}'::jsonb,
  created_at         timestamptz NOT NULL DEFAULT now(),
  updated_at         timestamptz NOT NULL DEFAULT now(),

  CONSTRAINT dataset_versions_identity_uq
    UNIQUE (dataset_key, version_key),
  -- Required by the composite foreign keys below. `id` remains the compact
  -- primary lookup while dataset_key makes cross-dataset mistakes impossible.
  CONSTRAINT dataset_versions_id_dataset_uq
    UNIQUE (id, dataset_key),
  CONSTRAINT dataset_versions_dataset_key_check
    CHECK (length(btrim(dataset_key)) BETWEEN 1 AND 160),
  CONSTRAINT dataset_versions_source_key_check
    CHECK (length(btrim(source_key)) BETWEEN 1 AND 160),
  CONSTRAINT dataset_versions_version_key_check
    CHECK (length(btrim(version_key)) BETWEEN 1 AND 500),
  CONSTRAINT dataset_versions_content_hash_check
    CHECK (content_hash ~ '^[0-9a-f]{64}$'),
  CONSTRAINT dataset_versions_status_check
    CHECK (status IN ('observed', 'validated', 'published', 'rejected')),
  CONSTRAINT dataset_versions_counts_check
    CHECK (
      record_count >= 0
      AND added_count >= 0
      AND changed_count >= 0
      AND removed_count >= 0
      AND invalid_count >= 0
    ),
  CONSTRAINT dataset_versions_json_objects_check
    CHECK (
      jsonb_typeof(provenance) = 'object'
      AND jsonb_typeof(metadata) = 'object'
    ),
  CONSTRAINT dataset_versions_valid_window_check
    CHECK (valid_until IS NULL OR valid_until > checked_at),
  CONSTRAINT dataset_versions_validation_state_check
    CHECK (status = 'observed' OR status = 'rejected' OR validated_at IS NOT NULL),
  CONSTRAINT dataset_versions_publishable_check
    CHECK (
      status <> 'published'
      OR (
        validated_at IS NOT NULL
        AND published_at IS NOT NULL
        AND valid_until IS NOT NULL
        AND valid_until > checked_at
      )
    ),
  CONSTRAINT dataset_versions_superseded_window_check
    CHECK (
      superseded_at IS NULL
      OR (published_at IS NOT NULL AND superseded_at >= published_at)
    )
);

CREATE INDEX IF NOT EXISTS dataset_versions_dataset_checked_idx
  ON public.dataset_versions (dataset_key, checked_at DESC, id);
CREATE INDEX IF NOT EXISTS dataset_versions_source_checked_idx
  ON public.dataset_versions (source_key, checked_at DESC, id);
CREATE UNIQUE INDEX IF NOT EXISTS dataset_versions_current_published_uq
  ON public.dataset_versions (dataset_key)
  WHERE status = 'published' AND superseded_at IS NULL;

CREATE TABLE IF NOT EXISTS public.dataset_feature_versions (
  id                  uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  dataset_version_id  uuid        NOT NULL,
  dataset_key         text        NOT NULL,
  feature_key         text        NOT NULL,
  feature_kind        text        NOT NULL,
  change_kind         text        NOT NULL,
  feature_status      text        NOT NULL DEFAULT 'active',
  content_hash        text        NOT NULL,
  source_record_id    text,
  source_url          text,
  properties          jsonb       NOT NULL DEFAULT '{}'::jsonb,
  geometry            jsonb,
  source_updated_at   timestamptz,
  observed_at         timestamptz NOT NULL,
  checked_at          timestamptz NOT NULL,
  superseded_at       timestamptz,
  created_at          timestamptz NOT NULL DEFAULT now(),

  CONSTRAINT dataset_feature_versions_dataset_fkey
    FOREIGN KEY (dataset_version_id, dataset_key)
    REFERENCES public.dataset_versions (id, dataset_key)
    ON DELETE RESTRICT,
  CONSTRAINT dataset_feature_versions_version_feature_uq
    UNIQUE (dataset_version_id, feature_key),
  CONSTRAINT dataset_feature_versions_feature_key_check
    CHECK (length(btrim(feature_key)) BETWEEN 1 AND 1000),
  CONSTRAINT dataset_feature_versions_feature_kind_check
    CHECK (
      feature_kind ~ '^[a-z][a-z0-9_.-]{0,119}$'
    ),
  CONSTRAINT dataset_feature_versions_change_kind_check
    CHECK (change_kind IN ('added', 'changed', 'unchanged', 'removed')),
  CONSTRAINT dataset_feature_versions_status_check
    CHECK (feature_status IN ('active', 'removed', 'unavailable')),
  CONSTRAINT dataset_feature_versions_removed_state_check
    CHECK (
      (feature_status = 'removed' AND change_kind = 'removed')
      OR (feature_status <> 'removed' AND change_kind <> 'removed')
    ),
  CONSTRAINT dataset_feature_versions_content_hash_check
    CHECK (content_hash ~ '^[0-9a-f]{64}$'),
  CONSTRAINT dataset_feature_versions_properties_object_check
    CHECK (jsonb_typeof(properties) = 'object'),
  CONSTRAINT dataset_feature_versions_geometry_check
    CHECK (
      geometry IS NULL
      OR (
        jsonb_typeof(geometry) = 'object'
        AND geometry ? 'type'
        AND geometry->>'type' IN (
          'Point',
          'MultiPoint',
          'LineString',
          'MultiLineString',
          'Polygon',
          'MultiPolygon',
          'GeometryCollection'
        )
      )
    ),
  CONSTRAINT dataset_feature_versions_observation_window_check
    CHECK (observed_at <= checked_at),
  CONSTRAINT dataset_feature_versions_superseded_window_check
    CHECK (superseded_at IS NULL OR superseded_at >= checked_at)
);

CREATE UNIQUE INDEX IF NOT EXISTS dataset_feature_versions_current_uq
  ON public.dataset_feature_versions (dataset_key, feature_key)
  WHERE superseded_at IS NULL;
CREATE INDEX IF NOT EXISTS dataset_feature_versions_current_active_idx
  ON public.dataset_feature_versions (dataset_key, feature_kind, feature_key)
  WHERE superseded_at IS NULL AND feature_status = 'active';
CREATE INDEX IF NOT EXISTS dataset_feature_versions_history_idx
  ON public.dataset_feature_versions (
    dataset_key,
    feature_key,
    observed_at DESC,
    id
  );
CREATE INDEX IF NOT EXISTS dataset_feature_versions_version_idx
  ON public.dataset_feature_versions (dataset_version_id);

CREATE TABLE IF NOT EXISTS public.field_observations (
  id                  uuid          PRIMARY KEY DEFAULT gen_random_uuid(),
  source_key          text          NOT NULL,
  observation_key     text          NOT NULL,
  dataset_version_id  uuid,
  dataset_key         text,
  entity_kind         text          NOT NULL,
  entity_key          text          NOT NULL,
  field_name          text          NOT NULL,
  value_status        text          NOT NULL,
  observed_value      jsonb,
  evidence_kind       text          NOT NULL,
  verification_status text          NOT NULL DEFAULT 'unverified',
  confidence          numeric(4, 3) NOT NULL,
  source_record_id    text,
  source_url          text,
  source_updated_at   timestamptz,
  observed_at         timestamptz   NOT NULL,
  checked_at          timestamptz   NOT NULL,
  valid_until         timestamptz,
  content_hash        text          NOT NULL,
  provenance          jsonb         NOT NULL DEFAULT '{}'::jsonb,
  created_at          timestamptz   NOT NULL DEFAULT now(),

  CONSTRAINT field_observations_source_observation_uq
    UNIQUE (source_key, observation_key),
  -- Lets resolved_field_state prove that its winning observation belongs to
  -- the same entity and field, rather than merely pointing at any UUID.
  CONSTRAINT field_observations_resolution_ref_uq
    UNIQUE (id, entity_kind, entity_key, field_name),
  CONSTRAINT field_observations_dataset_fkey
    FOREIGN KEY (dataset_version_id, dataset_key)
    REFERENCES public.dataset_versions (id, dataset_key)
    ON DELETE RESTRICT,
  CONSTRAINT field_observations_dataset_pair_check
    CHECK (
      (dataset_version_id IS NULL AND dataset_key IS NULL)
      OR (dataset_version_id IS NOT NULL AND dataset_key IS NOT NULL)
    ),
  CONSTRAINT field_observations_source_key_check
    CHECK (length(btrim(source_key)) BETWEEN 1 AND 160),
  CONSTRAINT field_observations_observation_key_check
    CHECK (length(btrim(observation_key)) BETWEEN 1 AND 1500),
  CONSTRAINT field_observations_entity_kind_check
    CHECK (entity_kind ~ '^[a-z][a-z0-9_.-]{0,119}$'),
  CONSTRAINT field_observations_entity_key_check
    CHECK (length(btrim(entity_key)) BETWEEN 1 AND 1000),
  CONSTRAINT field_observations_field_name_check
    CHECK (field_name ~ '^[a-z][a-z0-9_.-]{0,159}$'),
  CONSTRAINT field_observations_value_status_check
    CHECK (value_status IN ('asserted', 'absent', 'unavailable', 'retracted')),
  CONSTRAINT field_observations_value_payload_check
    CHECK (
      (
        value_status = 'asserted'
        AND observed_value IS NOT NULL
        AND jsonb_typeof(observed_value) <> 'null'
      )
      OR (value_status <> 'asserted' AND observed_value IS NULL)
    ),
  CONSTRAINT field_observations_evidence_kind_check
    CHECK (evidence_kind IN (
      'official_record',
      'owner_submission',
      'provider_api',
      'direct_observation',
      'curated_record',
      'community_report',
      'derived'
    )),
  CONSTRAINT field_observations_verification_status_check
    CHECK (verification_status IN ('unverified', 'corroborated', 'verified', 'rejected')),
  CONSTRAINT field_observations_confidence_check
    CHECK (confidence BETWEEN 0 AND 1),
  CONSTRAINT field_observations_content_hash_check
    CHECK (content_hash ~ '^[0-9a-f]{64}$'),
  CONSTRAINT field_observations_provenance_object_check
    CHECK (jsonb_typeof(provenance) = 'object'),
  CONSTRAINT field_observations_observation_window_check
    CHECK (observed_at <= checked_at),
  CONSTRAINT field_observations_valid_window_check
    CHECK (valid_until IS NULL OR valid_until > checked_at),
  CONSTRAINT field_observations_bounded_claim_check
    CHECK (
      value_status = 'unavailable'
      OR (valid_until IS NOT NULL AND valid_until > checked_at)
    )
);

CREATE INDEX IF NOT EXISTS field_observations_entity_field_idx
  ON public.field_observations (
    entity_kind,
    entity_key,
    field_name,
    checked_at DESC,
    id
  );
CREATE INDEX IF NOT EXISTS field_observations_source_checked_idx
  ON public.field_observations (source_key, checked_at DESC, id);
CREATE INDEX IF NOT EXISTS field_observations_valid_until_idx
  ON public.field_observations (valid_until)
  WHERE value_status IN ('asserted', 'absent', 'retracted');
CREATE INDEX IF NOT EXISTS field_observations_dataset_version_idx
  ON public.field_observations (dataset_version_id)
  WHERE dataset_version_id IS NOT NULL;

CREATE TABLE IF NOT EXISTS public.resolved_field_state (
  entity_kind            text          NOT NULL,
  entity_key             text          NOT NULL,
  field_name             text          NOT NULL,
  winning_observation_id uuid,
  resolution_status      text          NOT NULL,
  resolution_method      text          NOT NULL,
  resolved_value         jsonb,
  confidence             numeric(4, 3) NOT NULL DEFAULT 0,
  source_count           integer       NOT NULL DEFAULT 0,
  conflict_count         integer       NOT NULL DEFAULT 0,
  checked_at             timestamptz,
  valid_until            timestamptz,
  resolved_at            timestamptz   NOT NULL DEFAULT now(),
  evidence_summary       jsonb         NOT NULL DEFAULT '{}'::jsonb,
  updated_at             timestamptz   NOT NULL DEFAULT now(),

  CONSTRAINT resolved_field_state_pk
    PRIMARY KEY (entity_kind, entity_key, field_name),
  CONSTRAINT resolved_field_state_observation_fkey
    FOREIGN KEY (
      winning_observation_id,
      entity_kind,
      entity_key,
      field_name
    )
    REFERENCES public.field_observations (
      id,
      entity_kind,
      entity_key,
      field_name
    )
    ON DELETE RESTRICT,
  CONSTRAINT resolved_field_state_entity_kind_check
    CHECK (entity_kind ~ '^[a-z][a-z0-9_.-]{0,119}$'),
  CONSTRAINT resolved_field_state_entity_key_check
    CHECK (length(btrim(entity_key)) BETWEEN 1 AND 1000),
  CONSTRAINT resolved_field_state_field_name_check
    CHECK (field_name ~ '^[a-z][a-z0-9_.-]{0,159}$'),
  CONSTRAINT resolved_field_state_status_check
    CHECK (resolution_status IN ('known', 'unknown', 'disputed', 'retracted')),
  CONSTRAINT resolved_field_state_method_check
    CHECK (resolution_method IN (
      'single_source',
      'source_precedence',
      'corroborated',
      'owner_verified',
      'manual',
      'no_current_evidence'
    )),
  CONSTRAINT resolved_field_state_method_status_check
    CHECK (
      (resolution_status = 'unknown' AND resolution_method = 'no_current_evidence')
      OR (
        resolution_status <> 'unknown'
        AND resolution_method <> 'no_current_evidence'
      )
    ),
  CONSTRAINT resolved_field_state_confidence_check
    CHECK (confidence BETWEEN 0 AND 1),
  CONSTRAINT resolved_field_state_counts_check
    CHECK (
      source_count >= 0
      AND conflict_count >= 0
      AND conflict_count <= source_count
    ),
  CONSTRAINT resolved_field_state_evidence_summary_check
    CHECK (jsonb_typeof(evidence_summary) = 'object'),
  CONSTRAINT resolved_field_state_valid_window_check
    CHECK (valid_until IS NULL OR checked_at IS NULL OR valid_until > checked_at),
  CONSTRAINT resolved_field_state_known_value_check
    CHECK (
      (
        resolution_status = 'known'
        AND winning_observation_id IS NOT NULL
        AND resolved_value IS NOT NULL
        AND jsonb_typeof(resolved_value) <> 'null'
        AND confidence > 0
        AND source_count >= 1
        AND checked_at IS NOT NULL
        AND valid_until IS NOT NULL
        AND valid_until > checked_at
      )
      OR (
        resolution_status <> 'known'
        AND resolved_value IS NULL
      )
    )
);

CREATE INDEX IF NOT EXISTS resolved_field_state_status_expiry_idx
  ON public.resolved_field_state (
    entity_kind,
    resolution_status,
    valid_until,
    entity_key
  );
CREATE INDEX IF NOT EXISTS resolved_field_state_winner_idx
  ON public.resolved_field_state (winning_observation_id)
  WHERE winning_observation_id IS NOT NULL;

ALTER TABLE public.dataset_versions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.dataset_feature_versions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.field_observations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.resolved_field_state ENABLE ROW LEVEL SECURITY;

REVOKE ALL PRIVILEGES ON TABLE
  public.dataset_versions,
  public.dataset_feature_versions,
  public.field_observations,
  public.resolved_field_state
FROM PUBLIC, anon, authenticated;

GRANT SELECT, INSERT ON TABLE
  public.dataset_versions,
  public.dataset_feature_versions,
  public.field_observations
TO service_role;

GRANT UPDATE (
  status,
  validated_at,
  published_at,
  superseded_at,
  metadata,
  updated_at
) ON public.dataset_versions TO service_role;

GRANT UPDATE (superseded_at)
  ON public.dataset_feature_versions TO service_role;

GRANT UPDATE (verification_status, provenance)
  ON public.field_observations TO service_role;

GRANT SELECT, INSERT, UPDATE, DELETE
  ON public.resolved_field_state TO service_role;

COMMENT ON TABLE public.dataset_versions IS
  'Server-owned dataset collection/version evidence. Publication requires validation and a bounded validity window.';
COMMENT ON TABLE public.dataset_feature_versions IS
  'Append-only place/GIS feature history with one explicit current state per dataset and feature key.';
COMMENT ON TABLE public.field_observations IS
  'Append-only source evidence for one entity field; absence, unavailability, and retraction remain distinct from an asserted value.';
COMMENT ON TABLE public.resolved_field_state IS
  'Server-owned current resolution for one entity field. Runtime reads must still compare valid_until with now().';

ANALYZE public.dataset_versions;
ANALYZE public.dataset_feature_versions;
ANALYZE public.field_observations;
ANALYZE public.resolved_field_state;

COMMIT;

-- Verification after apply:
--
-- SELECT relname, relrowsecurity
-- FROM pg_class
-- WHERE oid IN (
--   'public.dataset_versions'::regclass,
--   'public.dataset_feature_versions'::regclass,
--   'public.field_observations'::regclass,
--   'public.resolved_field_state'::regclass
-- );
--
-- SELECT grantee, table_name, privilege_type
-- FROM information_schema.role_table_grants
-- WHERE table_schema = 'public'
--   AND table_name IN (
--     'dataset_versions',
--     'dataset_feature_versions',
--     'field_observations',
--     'resolved_field_state'
--   )
--   AND grantee IN ('PUBLIC', 'anon', 'authenticated', 'service_role')
-- ORDER BY table_name, grantee, privilege_type;
--
-- SELECT indexname, indexdef
-- FROM pg_indexes
-- WHERE schemaname = 'public'
--   AND tablename IN (
--     'dataset_versions',
--     'dataset_feature_versions',
--     'field_observations',
--     'resolved_field_state'
--   )
-- ORDER BY tablename, indexname;
