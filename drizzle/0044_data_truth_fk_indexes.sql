-- 0044_data_truth_fk_indexes.sql
--
-- Cover the composite foreign keys in the data-truth foundation before the
-- shadow-write pipeline begins carrying meaningful volume. PostgreSQL does
-- not create indexes for referencing columns automatically; without these,
-- deletes or key checks on the parent rows can scan the evidence tables.
--
-- Additive and idempotent. Apply by hand after 0043, per drizzle/README.md.
-- Do not mark this migration as deployed until the live indexes are verified.

BEGIN;

SET LOCAL lock_timeout = '5s';
SET LOCAL statement_timeout = '30s';

CREATE INDEX IF NOT EXISTS dataset_feature_versions_dataset_fk_idx
  ON public.dataset_feature_versions (dataset_version_id, dataset_key);

CREATE INDEX IF NOT EXISTS field_observations_dataset_fk_idx
  ON public.field_observations (dataset_version_id, dataset_key)
  WHERE dataset_version_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS resolved_field_state_observation_fk_idx
  ON public.resolved_field_state (
    winning_observation_id,
    entity_kind,
    entity_key,
    field_name
  )
  WHERE winning_observation_id IS NOT NULL;

COMMIT;

-- Verification after apply:
--
-- SELECT indexname, indexdef
-- FROM pg_indexes
-- WHERE schemaname = 'public'
--   AND indexname IN (
--     'dataset_feature_versions_dataset_fk_idx',
--     'field_observations_dataset_fk_idx',
--     'resolved_field_state_observation_fk_idx'
--   )
-- ORDER BY indexname;
