-- 0042_data_truth_least_privilege.sql
--
-- Supabase projects may grant broad table privileges to service_role through
-- schema defaults at CREATE TABLE time. Migration 0041 added the intended
-- narrow grants, but a GRANT does not remove privileges inherited from those
-- defaults. Revoke first, then restore only the writer capabilities required
-- by the append-only data-truth contract.
--
-- Additive to the security posture and idempotent. Apply by hand after 0041,
-- per drizzle/README.md.

BEGIN;

SET LOCAL lock_timeout = '5s';
SET LOCAL statement_timeout = '30s';

REVOKE ALL PRIVILEGES ON TABLE
  public.dataset_versions,
  public.dataset_feature_versions,
  public.field_observations,
  public.resolved_field_state
FROM service_role;

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

COMMIT;

-- Verification after apply:
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
-- SELECT table_name, column_name, privilege_type
-- FROM information_schema.column_privileges
-- WHERE table_schema = 'public'
--   AND table_name IN (
--     'dataset_versions',
--     'dataset_feature_versions',
--     'field_observations'
--   )
--   AND grantee = 'service_role'
-- ORDER BY table_name, column_name, privilege_type;
