-- Admin curation decisions, shared by discovered-review (approve/reject a
-- discovered place candidate) and drift-review (accept/reject one drifted
-- field). Replaces the dev-only local-JSON persistence so the owner can curate
-- from prod / a phone. Additive: new table, no existing data touched.
--
-- Applied to prod (project vrjujcyuzlipqkrtshhr) via the Supabase MCP on
-- 2026-07-12; committed here for the migration record.
CREATE TABLE IF NOT EXISTS public.curation_decisions (
  tool        text        NOT NULL,            -- 'discovered' | 'drift'
  target_id   text        NOT NULL,            -- google_place_id (discovered) | place slug (drift)
  field       text        NOT NULL DEFAULT '', -- '' (discovered) | drifted field name (drift)
  decision    text        NOT NULL,            -- 'approved'|'rejected' (discovered) | 'accepted'|'rejected' (drift)
  decided_at  timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (tool, target_id, field)
);

-- Owner-only. The Basic-Auth admin writes over the RLS-bypassing postgres
-- pooler connection; RLS enabled with NO public policy keeps the anon/public
-- API from ever reading or writing curation state (matches every other table).
ALTER TABLE public.curation_decisions ENABLE ROW LEVEL SECURITY;

COMMENT ON TABLE public.curation_decisions IS 'Admin curation decisions (discovered-review approvals, drift-review field accepts). Owner-only via Basic-Auth admin; RLS on with no public policy.';
